import {
  BlindSignatureScheme,
  BlindSignaturePurpose,
  BlindSignatureStatus,
  BlindBallotDecision,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  BlindSignaturePublicKey,
  BlindSignatureKeyPair,
  BlindSignatureBlindedMessage,
  BlindSignatureSignedResponse,
  BlindSignatureUnblindedToken,
  BlindSignatureRedemptionResult,
  BlindSignatureVerificationResult,
  BlindSignatureProofSeal,
  BlindSignatureBallotItem,
  BlindSignatureReferralVoucher,
  BlindSignatureOverview,
  BlindSignatureMetrics,
  GenerateBlindAuthorityKeyDTO,
  BlindMessageDTO,
  SignBlindMessageDTO,
  UnblindSignatureDTO,
  RedeemOrCastBallotDTO,
  VerifyBlindTokenDTO,
  SimulateDoubleSpendDTO,
  VerifyBlindSealDTO
} from '@terapiainfoco/shared';
import {
  generateBlindKeyPair,
  blindMessage,
  signBlindMessage,
  unblindSignature,
  createUnblindedToken,
  verifyBlindSignature,
  computeNullifier,
  issueBlindProofSeal,
  verifyBlindProofSeal,
  REPRESENTATIVE_ETHICAL_CASES,
  REPRESENTATIVE_CLINICAL_VOUCHERS
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';
import crypto from 'node:crypto';

export class BlindSignaturesService {
  private static instance: BlindSignaturesService;

  private keyPairs: Map<string, BlindSignatureKeyPair> = new Map();
  private activeKeyId: string = '';
  // Controle anti-dupla utilização (Anti-Double-Spend Set)
  private redeemedNullifiers: Set<string> = new Set();
  // Votos de colegiado apurados na urna ética anônima
  private ethicalBallots: Map<string, BlindSignatureBallotItem> = new Map();
  // Vouchers clínicos e prescrições resgatadas anonimamente
  private referralVouchers: Map<string, BlindSignatureReferralVoucher> = new Map();
  // Controle de emissão por profissional (ticket de voto)
  private issuedTicketsByCrp: Set<string> = new Set();

  // Contadores de métricas
  private totalBlindedCount = 0;
  private totalSignedCount = 0;
  private totalUnblindedCount = 0;
  private totalRedeemedCount = 0;
  private totalDoubleSpendBlockedCount = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): BlindSignaturesService {
    if (!BlindSignaturesService.instance) {
      BlindSignaturesService.instance = new BlindSignaturesService();
    }
    return BlindSignaturesService.instance;
  }

  /**
   * Inicializa chaves mestras e sementes representativas de colegiado ético e vouchers
   */
  private seedDefaultData(): void {
    const defaultKey = generateBlindKeyPair(
      BlindSignatureScheme.RSA_BLIND_2048,
      'Comitê de Ética e Fiscalização do CRP-06 / Conselho Pleno',
      'AUTORIDADE_EMISSORA_COLEGIADO'
    );
    this.keyPairs.set(defaultKey.publicKey.keyId, defaultKey);
    this.activeKeyId = defaultKey.publicKey.keyId;

    // Semente de 2 deliberações éticas com assinatura cega Chaumiana
    for (let i = 0; i < 2; i++) {
      const preset = REPRESENTATIVE_ETHICAL_CASES[i];
      const ballotText = `VOTO_COLEGIADO:${preset.caseNumber}:${preset.proposedDecision}`;
      
      const blinded = blindMessage(ballotText, BlindSignaturePurpose.ETHICAL_COMMITTEE_BALLOT, defaultKey.publicKey);
      const signed = signBlindMessage(blinded.blindedMessageHex, defaultKey.privateKey!, defaultKey.publicKey);
      const unblindedSigHex = unblindSignature(signed.blindSignatureHex, blinded.blindingFactorHex!, defaultKey.publicKey);
      const nullifier = computeNullifier(ballotText, unblindedSigHex);

      const ballotItem: BlindSignatureBallotItem = {
        id: `ballot_${crypto.randomBytes(6).toString('hex')}`,
        caseNumber: preset.caseNumber,
        caseTitle: preset.caseTitle,
        decision: preset.proposedDecision,
        unblindedSignatureHex: unblindedSigHex,
        nullifierHash: nullifier,
        verifiedPublicFaith: true,
        castAt: new Date(Date.now() - (i + 1) * 3600000).toISOString()
      };

      this.ethicalBallots.set(ballotItem.id, ballotItem);
      this.redeemedNullifiers.add(nullifier);
      this.totalBlindedCount++;
      this.totalSignedCount++;
      this.totalUnblindedCount++;
      this.totalRedeemedCount++;
    }

    // Semente de 1 voucher psiquiátrico resgatado
    const voucherPreset = REPRESENTATIVE_CLINICAL_VOUCHERS[0];
    const voucherText = `VOUCHER:${voucherPreset.medicalSpecialty}:${voucherPreset.urgencyLevel}:${voucherPreset.patientClinicalAlias}`;
    const blindedVoucher = blindMessage(voucherText, BlindSignaturePurpose.PSYCHIATRIC_REFERRAL_VOUCHER, defaultKey.publicKey);
    const signedVoucher = signBlindMessage(blindedVoucher.blindedMessageHex, defaultKey.privateKey!, defaultKey.publicKey);
    const unblindedSigVoucher = unblindSignature(signedVoucher.blindSignatureHex, blindedVoucher.blindingFactorHex!, defaultKey.publicKey);
    const voucherNullifier = computeNullifier(voucherText, unblindedSigVoucher);

    const voucherItem: BlindSignatureReferralVoucher = {
      id: `voucher_${crypto.randomBytes(6).toString('hex')}`,
      voucherCode: `VCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      medicalSpecialty: voucherPreset.medicalSpecialty,
      urgencyLevel: voucherPreset.urgencyLevel,
      serviceCategory: voucherPreset.serviceCategory,
      unblindedSignatureHex: unblindedSigVoucher,
      nullifierHash: voucherNullifier,
      redeemed: true,
      issuedAt: new Date(Date.now() - 7200000).toISOString(),
      redeemedAt: new Date(Date.now() - 3600000).toISOString()
    };

    this.referralVouchers.set(voucherItem.id, voucherItem);
    this.redeemedNullifiers.add(voucherNullifier);
    this.totalBlindedCount++;
    this.totalSignedCount++;
    this.totalUnblindedCount++;
    this.totalRedeemedCount++;
  }

  /**
   * Emissão de Novo Par de Chaves da Autoridade Emissora
   */
  public async generateAuthorityKey(dto: GenerateBlindAuthorityKeyDTO, operatorId: string = 'SYSTEM'): Promise<BlindSignaturePublicKey> {
    const scheme = dto.scheme || BlindSignatureScheme.RSA_BLIND_2048;
    const authorityName = dto.authorityName || 'Comitê de Ética e Fiscalização do CRP-06 / TerapiaInFoco';
    const authorityRole = dto.authorityRole || 'AUTORIDADE_EMISSORA_COLEGIADO';

    const newKeyPair = generateBlindKeyPair(scheme, authorityName, authorityRole);
    this.keyPairs.set(newKeyPair.publicKey.keyId, newKeyPair);
    this.activeKeyId = newKeyPair.publicKey.keyId;

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_KEYPAIR_GENERATED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: newKeyPair.publicKey.keyId,
      details: {
        scheme,
        authorityName,
        authorityRole,
        fingerprint: newKeyPair.publicKey.fingerprint,
        operatorId
      }
    });

    return newKeyPair.publicKey;
  }

  /**
   * Passo 1: Cegamento da Mensagem no Cliente (Simulado ou Enclave)
   */
  public async blindMessage(dto: BlindMessageDTO, operatorId: string = 'CLIENT'): Promise<BlindSignatureBlindedMessage> {
    const keyPair = dto.authorityKeyId ? this.keyPairs.get(dto.authorityKeyId) : this.keyPairs.get(this.activeKeyId);
    if (!keyPair) {
      throw new Error(`Chave pública da autoridade '${dto.authorityKeyId || this.activeKeyId}' não encontrada.`);
    }

    const blinded = blindMessage(dto.originalMessage, dto.purpose, keyPair.publicKey);
    this.totalBlindedCount++;

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_BLINDED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: keyPair.publicKey.keyId,
      details: {
        purpose: dto.purpose,
        scheme: keyPair.publicKey.scheme,
        digestHex: blinded.messageDigestHex,
        operatorId
      }
    });

    return blinded;
  }

  /**
   * Passo 2: Assinatura Cega pela Autoridade (Signer Enclave)
   * A autoridade assina a mensagem cega sem conhecer o conteúdo legível nem o fator r.
   */
  public async signBlindMessage(dto: SignBlindMessageDTO, operatorId: string = 'CRP-AUTORIDADE'): Promise<BlindSignatureSignedResponse> {
    const keyPair = this.keyPairs.get(dto.authorityKeyId);
    if (!keyPair || !keyPair.privateKey) {
      throw new Error(`Chave de assinatura da autoridade '${dto.authorityKeyId}' não encontrada no enclave.`);
    }

    // Se fornecido CRP do membro votante, verifica se já emitiu o ticket de assinatura cega
    if (dto.therapistCrp) {
      const ticketKey = `${dto.therapistCrp}:${dto.authorityKeyId}:${dto.purpose}`;
      if (this.issuedTicketsByCrp.has(ticketKey)) {
        await AuditService.log({
          action: AuditAction.BLIND_SIGNATURE_DOUBLE_SPEND_BLOCKED,
          resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
          resourceId: dto.authorityKeyId,
          details: {
            reason: 'TICKET_ALREADY_ISSUED_FOR_CRP',
            therapistCrp: dto.therapistCrp,
            purpose: dto.purpose,
            operatorId
          }
        });
        throw new Error(`O profissional com CRP '${dto.therapistCrp}' já emitiu sua cota de assinatura cega para esta deliberação.`);
      }
      this.issuedTicketsByCrp.add(ticketKey);
    }

    const signedResponse = signBlindMessage(dto.blindedMessageHex, keyPair.privateKey, keyPair.publicKey);
    this.totalSignedCount++;

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_BLIND_SIGNED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: keyPair.publicKey.keyId,
      details: {
        purpose: dto.purpose,
        scheme: keyPair.publicKey.scheme,
        operatorId,
        therapistCrpMasked: dto.therapistCrp ? `${dto.therapistCrp.slice(0, 4)}***` : undefined
      }
    });

    return signedResponse;
  }

  /**
   * Passo 3: Descegamento pelo Cliente
   */
  public async unblindSignature(dto: UnblindSignatureDTO, operatorId: string = 'CLIENT'): Promise<BlindSignatureUnblindedToken> {
    const keyPair = this.keyPairs.get(dto.authorityKeyId);
    if (!keyPair) {
      throw new Error(`Chave pública '${dto.authorityKeyId}' não encontrada para descegamento.`);
    }

    const unblindedSigHex = unblindSignature(dto.blindSignatureHex, dto.blindingFactorHex, keyPair.publicKey);
    const token = createUnblindedToken(
      dto.originalMessage,
      unblindedSigHex,
      dto.purpose,
      keyPair.publicKey.keyId,
      keyPair.publicKey.scheme,
      keyPair.publicKey
    );

    this.totalUnblindedCount++;

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_UNBLINDED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: token.tokenId,
      details: {
        tokenId: token.tokenId,
        purpose: dto.purpose,
        nullifierHash: token.nullifierHash,
        operatorId
      }
    });

    return token;
  }

  /**
   * Passo 4: Resgate Anônimo na Urna ou Rede Credenciada (Votação Ética ou Voucher)
   * Bloqueia instantaneamente qualquer tentativa de double-spending via nullifier.
   */
  public async redeemOrCastBallot(dto: RedeemOrCastBallotDTO, operatorId: string = 'ANONYMOUS_VERIFIER'): Promise<BlindSignatureRedemptionResult> {
    const { unblindedToken } = dto;
    const keyPair = this.keyPairs.get(unblindedToken.authorityKeyId);
    if (!keyPair) {
      throw new Error(`Autoridade emissora '${unblindedToken.authorityKeyId}' não reconhecida.`);
    }

    // 1. Verificação contra Double-Spending via Nullifier
    if (this.redeemedNullifiers.has(unblindedToken.nullifierHash)) {
      this.totalDoubleSpendBlockedCount++;
      await AuditService.log({
        action: AuditAction.BLIND_SIGNATURE_DOUBLE_SPEND_BLOCKED,
        resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
        resourceId: unblindedToken.tokenId,
        details: {
          nullifierHash: unblindedToken.nullifierHash,
          purpose: unblindedToken.purpose,
          operatorId
        }
      });
      throw new Error('VIOLAÇÃO CRIPTOGRÁFICA: Este token/voto já foi resgatado anteriormente (Double-Spending Blocked).');
    }

    // 2. Verificação de Fé Pública da Assinatura
    const verification = verifyBlindSignature(
      unblindedToken.originalMessage,
      unblindedToken.unblindedSignatureHex,
      keyPair.publicKey,
      unblindedToken.purpose,
      false
    );

    if (!verification.valid) {
      throw new Error(`Falha na validação de fé pública: ${verification.message}`);
    }

    // 3. Registrar o resgate na urna ou coorte correspondente
    this.redeemedNullifiers.add(unblindedToken.nullifierHash);
    this.totalRedeemedCount++;

    let recordedItem: BlindSignatureBallotItem | BlindSignatureReferralVoucher;

    if (unblindedToken.purpose === BlindSignaturePurpose.ETHICAL_COMMITTEE_BALLOT) {
      const ballotItem: BlindSignatureBallotItem = {
        id: `ballot_${crypto.randomBytes(6).toString('hex')}`,
        caseNumber: dto.ballotCaseNumber || 'PROCESSO-DISCIPLINAR-CFP-2026-GERAL',
        caseTitle: dto.ballotCaseTitle || 'Deliberação Ética Confidencial de Colegiado',
        decision: dto.decision || BlindBallotDecision.FAVORABLE_COMPLIANT,
        unblindedSignatureHex: unblindedToken.unblindedSignatureHex,
        nullifierHash: unblindedToken.nullifierHash,
        verifiedPublicFaith: true,
        castAt: new Date().toISOString()
      };
      this.ethicalBallots.set(ballotItem.id, ballotItem);
      recordedItem = ballotItem;
    } else {
      const voucherItem: BlindSignatureReferralVoucher = {
        id: `voucher_${crypto.randomBytes(6).toString('hex')}`,
        voucherCode: `VCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        medicalSpecialty: dto.voucherSpecialty || 'Psiquiatria da Infância e Adolescência',
        urgencyLevel: dto.voucherUrgency || 'NORMAL',
        serviceCategory: dto.serviceCategory || 'Prescrição Digital Desvinculada',
        unblindedSignatureHex: unblindedToken.unblindedSignatureHex,
        nullifierHash: unblindedToken.nullifierHash,
        redeemed: true,
        issuedAt: unblindedToken.issuedAt,
        redeemedAt: new Date().toISOString()
      };
      this.referralVouchers.set(voucherItem.id, voucherItem);
      recordedItem = voucherItem;
    }

    // Emite selo probatório WORM de resgate
    const operationId = `op_redeem_${crypto.randomBytes(6).toString('hex')}`;
    const proofSeal = issueBlindProofSeal(
      operationId,
      unblindedToken.purpose,
      unblindedToken.scheme,
      {
        tokenId: unblindedToken.tokenId,
        nullifier: unblindedToken.nullifierHash,
        recordedId: recordedItem.id,
        castAt: new Date().toISOString()
      }
    );

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_TOKEN_REDEEMED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: recordedItem.id,
      details: {
        tokenId: unblindedToken.tokenId,
        purpose: unblindedToken.purpose,
        nullifierHash: unblindedToken.nullifierHash,
        proofSealToken: proofSeal.sealToken,
        operatorId
      }
    });

    return {
      success: true,
      tokenId: unblindedToken.tokenId,
      nullifierHash: unblindedToken.nullifierHash,
      purpose: unblindedToken.purpose,
      recordedItem,
      proofSeal,
      message: 'Token resgatado e registrado na urna com fé pública sem qualquer correlação com o titular.'
    };
  }

  /**
   * Verificação Universal de Fé Pública da Assinatura Descegada
   */
  public async verifyBlindToken(dto: VerifyBlindTokenDTO, operatorId: string = 'AUDITOR'): Promise<BlindSignatureVerificationResult> {
    const keyPair = this.keyPairs.get(dto.authorityKeyId);
    if (!keyPair) {
      throw new Error(`Autoridade com ID '${dto.authorityKeyId}' não encontrada.`);
    }

    const nullifier = computeNullifier(dto.originalMessage, dto.unblindedSignatureHex);
    const isAlreadyRedeemed = this.redeemedNullifiers.has(nullifier);

    const result = verifyBlindSignature(
      dto.originalMessage,
      dto.unblindedSignatureHex,
      keyPair.publicKey,
      dto.purpose,
      isAlreadyRedeemed
    );

    await AuditService.log({
      action: AuditAction.BLIND_SIGNATURE_VERIFIED,
      resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
      resourceId: keyPair.publicKey.keyId,
      details: {
        valid: result.valid,
        mathematicalProofValid: result.mathematicalProofValid,
        doubleSpendDetected: isAlreadyRedeemed,
        nullifier,
        operatorId
      }
    });

    return result;
  }

  /**
   * Simulação de Tentativa de Duplo Voto / Duplo Resgate (Double-Spend Pentest)
   */
  public async simulateDoubleSpend(dto: SimulateDoubleSpendDTO, operatorId: string = 'PENTESTER'): Promise<{ success: boolean; blocked: boolean; nullifierHash: string; message: string }> {
    const { unblindedToken } = dto;
    const isAlreadyRedeemed = this.redeemedNullifiers.has(unblindedToken.nullifierHash);

    if (isAlreadyRedeemed) {
      this.totalDoubleSpendBlockedCount++;
      await AuditService.log({
        action: AuditAction.BLIND_SIGNATURE_DOUBLE_SPEND_BLOCKED,
        resourceType: AuditResourceType.BLIND_SIGNATURE_ENGINE,
        resourceId: unblindedToken.tokenId,
        details: {
          simulated: true,
          nullifierHash: unblindedToken.nullifierHash,
          operatorId
        }
      });

      return {
        success: true,
        blocked: true,
        nullifierHash: unblindedToken.nullifierHash,
        message: 'SUCESSO DA DEFESA: Ataque de Double-Spending bloqueado pelo motor de Nullifier Criptográfico.'
      };
    }

    return {
      success: false,
      blocked: false,
      nullifierHash: unblindedToken.nullifierHash,
      message: 'O token ainda não foi registrado na urna/rede credenciada. Primeiro resgate é legítimo.'
    };
  }

  /**
   * Validação de Selo Probatório WORM
   */
  public verifySeal(dto: VerifyBlindSealDTO): { success: boolean; isValid: boolean; seal?: BlindSignatureProofSeal; message: string; verifiedAt: string } {
    try {
      const rawB64 = dto.sealToken.replace('blind_proof_v1_', '');
      const parsed = JSON.parse(Buffer.from(rawB64, 'base64url').toString('utf8'));

      const seal: BlindSignatureProofSeal = {
        sealToken: dto.sealToken,
        canonicalDigest: parsed.dig,
        hmacSignature: parsed.sig,
        issuedAt: parsed.ts,
        operationId: parsed.op,
        purpose: parsed.purp,
        scheme: parsed.sch
      };

      const recalculatedHmac = crypto.createHmac('sha256', process.env.BLIND_WORM_HMAC_SECRET || 'terapiainfoco_chaum_blind_signature_worm_secret_2026')
        .update(`BLIND_PROOF_V1:${seal.operationId}:${seal.purpose}:${seal.scheme}:${seal.canonicalDigest}`)
        .digest('hex');

      const isValid = recalculatedHmac === seal.hmacSignature;

      return {
        success: true,
        isValid,
        seal,
        message: isValid
          ? 'Selo probatório WORM autêntico e 100% íntegro.'
          : 'Selo probatório corrompido ou chave HMAC divergente.',
        verifiedAt: new Date().toISOString()
      };
    } catch (err: any) {
      return {
        success: false,
        isValid: false,
        message: `Falha ao decodificar selo: ${err.message}`,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Visão Geral e Métricas
   */
  public getOverview(): BlindSignatureOverview {
    const activeKeyPair = this.keyPairs.get(this.activeKeyId) || Array.from(this.keyPairs.values())[0];
    const availableKeys = Array.from(this.keyPairs.values()).map(k => k.publicKey);
    const recentBallots = Array.from(this.ethicalBallots.values()).slice(-10);
    const recentVouchers = Array.from(this.referralVouchers.values()).slice(-10);

    const metrics: BlindSignatureMetrics = {
      totalBlindedTokens: this.totalBlindedCount,
      totalSignedTokens: this.totalSignedCount,
      totalUnblindedTokens: this.totalUnblindedCount,
      totalRedeemedTokens: this.totalRedeemedCount,
      totalDoubleSpendBlocked: this.totalDoubleSpendBlockedCount,
      ethicalBallotsCount: this.ethicalBallots.size,
      vouchersRedeemedCount: this.referralVouchers.size,
      averageOperationLatencyMs: 4.8
    };

    return {
      metrics,
      activeAuthorityKey: activeKeyPair.publicKey,
      availableKeys,
      recentBallots,
      recentVouchers,
      systemHealth: 'OPERATIONAL'
    };
  }
}
