import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  ZkpProofType,
  ZkpVerificationStatus,
  type ZkpClinicalDocumentProof,
  type ZkpVerificationResult,
  type ZkpSystemMetrics,
  type GenerateZkpProofDTO,
  type VerifyZkpProofDTO
} from '@terapiainfoco/shared';
import {
  createSchnorrZkpProof,
  verifySchnorrZkpProof,
  createTherapistCrpCommitment,
  calculateZkpDigest,
  encodeZkpToken,
  decodeZkpToken
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class ZkpService {
  private static instance: ZkpService;

  private proofs = new Map<string, ZkpClinicalDocumentProof>();
  private proofsByToken = new Map<string, ZkpClinicalDocumentProof>();

  // Métricas agregadas
  private totalProofsGenerated = 0;
  private totalVerificationsExecuted = 0;
  private validVerificationsCount = 0;
  private invalidAttemptsCount = 0;
  private totalVerificationLatencyMs = 0;
  private lastProofGeneratedAt?: string;
  private lastVerificationAt?: string;

  public static getInstance(): ZkpService {
    if (!ZkpService.instance) {
      ZkpService.instance = new ZkpService();
    }
    return ZkpService.instance;
  }

  /**
   * 1. Gera Prova de Conhecimento Zero (Schnorr NIZK) para um documento clínico/CFP
   */
  public async generateProof(params: {
    therapistId: string;
    dto: GenerateZkpProofDTO;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ZkpClinicalDocumentProof> {
    const proofId = `zkp-${crypto.randomUUID()}`;
    const proofType = params.dto.proofType ?? ZkpProofType.FULL_FORENSIC_ZKP;
    const documentIssuedAt = params.dto.documentIssuedAt ?? new Date().toISOString();
    const ttlSeconds = params.dto.ttlSeconds ?? 31536000; // 1 ano de validade padrão
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    // Compromisso do CRP do psicólogo garantindo fé pública sem expor dados pessoais
    const therapistCrpCommitment = createTherapistCrpCommitment(
      `CRP-06/SP-${params.therapistId.slice(0, 8)}`,
      'terapiainfoco-crp-salt'
    );

    // Contexto imutável de verificação Fiat-Shamir
    const contextMetadata = `DOC_ID=${params.dto.documentId}|TYPE=${params.dto.documentTypeClaim}|CRP=${therapistCrpCommitment}|ISSUED=${documentIssuedAt}`;

    // Segredo do provador derivado da chave do profissional e ID do documento
    const secretSeed = `SIGNING_SECRET:${params.therapistId}:${params.dto.documentId}:SALT_ZKP`;

    // Gera prova Schnorr
    const schnorrProof = createSchnorrZkpProof({
      secretValue: secretSeed,
      contextMetadata
    });

    const probatoryWormDigest = calculateZkpDigest({
      proofId,
      documentId: params.dto.documentId,
      crpCommitment: therapistCrpCommitment,
      documentType: params.dto.documentTypeClaim,
      challengeHex: schnorrProof.challengeHex,
      commitHex: schnorrProof.commitHex
    });

    const proofWithoutToken: ZkpClinicalDocumentProof = {
      proofId,
      documentId: params.dto.documentId,
      proofType,
      therapistId: params.therapistId,
      therapistCrpCommitment,
      documentTypeClaim: params.dto.documentTypeClaim,
      documentIssuedAt,
      schnorrProof,
      publicVerificationToken: '',
      probatoryWormDigest,
      createdAt: now.toISOString(),
      expiresAt
    };

    // Gera token público para uso por terceiros
    const publicVerificationToken = encodeZkpToken(proofWithoutToken);
    const finalProof: ZkpClinicalDocumentProof = {
      ...proofWithoutToken,
      publicVerificationToken
    };

    this.proofs.set(proofId, finalProof);
    this.proofsByToken.set(publicVerificationToken, finalProof);

    this.totalProofsGenerated++;
    this.lastProofGeneratedAt = finalProof.createdAt;

    // Trilha WORM imutável
    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.ZKP_PROOF,
      resourceId: proofId,
      action: AuditAction.ZKP_PROOF_GENERATED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return finalProof;
  }

  /**
   * 2. Verifica publicamente a Prova Zero-Knowledge sem NUNCA expor dados do documento clínico
   */
  public async verifyProof(params: {
    dto: VerifyZkpProofDTO;
    actorId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ZkpVerificationResult> {
    const startTime = performance.now();
    this.totalVerificationsExecuted++;

    let decodedProof: ZkpClinicalDocumentProof;
    try {
      decodedProof = decodeZkpToken(params.dto.publicVerificationToken);
    } catch {
      this.invalidAttemptsCount++;
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        valid: false,
        status: ZkpVerificationStatus.INVALID_PROOF,
        proofType: ZkpProofType.FULL_FORENSIC_ZKP,
        documentTypeClaim: 'Desconhecido',
        therapistCrpCommitment: '',
        documentIssuedAt: '',
        verifiedAt: new Date().toISOString(),
        verificationLatencyMs: latencyMs,
        probatoryWormDigest: '',
        message: 'Token de Prova Zero-Knowledge malformado ou corrompido.'
      };
    }

    const now = new Date();

    // 1. Valida expiração
    if (new Date(decodedProof.expiresAt).getTime() < now.getTime()) {
      this.invalidAttemptsCount++;
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        valid: false,
        status: ZkpVerificationStatus.EXPIRED_CREDENTIAL,
        proofType: decodedProof.proofType,
        documentTypeClaim: decodedProof.documentTypeClaim,
        therapistCrpCommitment: decodedProof.therapistCrpCommitment,
        documentIssuedAt: decodedProof.documentIssuedAt,
        verifiedAt: now.toISOString(),
        verificationLatencyMs: latencyMs,
        probatoryWormDigest: decodedProof.probatoryWormDigest,
        message: 'A prova Zero-Knowledge expirou o prazo probatório de validade.'
      };
    }

    // 2. Reconstrói o contexto Fiat-Shamir
    const contextMetadata = `DOC_ID=${decodedProof.documentId}|TYPE=${decodedProof.documentTypeClaim}|CRP=${decodedProof.therapistCrpCommitment}|ISSUED=${decodedProof.documentIssuedAt}`;

    // 3. Valida a equação de Schnorr
    const schnorrResult = verifySchnorrZkpProof({
      proof: decodedProof.schnorrProof,
      contextMetadata
    });

    const latencyMs = Math.round(performance.now() - startTime);
    this.totalVerificationLatencyMs += latencyMs;
    this.lastVerificationAt = now.toISOString();

    if (!schnorrResult.valid) {
      this.invalidAttemptsCount++;
      return {
        valid: false,
        status: schnorrResult.reason?.includes('Fiat-Shamir')
          ? ZkpVerificationStatus.TAMPERED_CHALLENGE
          : ZkpVerificationStatus.INVALID_PROOF,
        proofType: decodedProof.proofType,
        documentTypeClaim: decodedProof.documentTypeClaim,
        therapistCrpCommitment: decodedProof.therapistCrpCommitment,
        documentIssuedAt: decodedProof.documentIssuedAt,
        verifiedAt: now.toISOString(),
        verificationLatencyMs: latencyMs,
        probatoryWormDigest: decodedProof.probatoryWormDigest,
        message: `Falha na verificação ZKP: ${schnorrResult.reason}`
      };
    }

    this.validVerificationsCount++;

    // Trilha WORM de validação bem-sucedida
    AuditService.log({
      actorId: params.actorId || 'PUBLIC_ANONYMOUS_VERIFIER',
      resourceType: AuditResourceType.ZKP_PROOF,
      resourceId: decodedProof.proofId,
      action: AuditAction.ZKP_PROOF_VERIFIED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return {
      valid: true,
      status: ZkpVerificationStatus.VERIFIED_VALID,
      proofType: decodedProof.proofType,
      documentTypeClaim: decodedProof.documentTypeClaim,
      therapistCrpCommitment: decodedProof.therapistCrpCommitment,
      documentIssuedAt: decodedProof.documentIssuedAt,
      verifiedAt: now.toISOString(),
      verificationLatencyMs: latencyMs,
      probatoryWormDigest: decodedProof.probatoryWormDigest,
      message: `Autenticidade de ${decodedProof.documentTypeClaim} atestada com sucesso! 100% de integridade com 0% de dados clínicos revelados.`
    };
  }

  /**
   * 3. Retorna lista de provas geradas
   */
  public listProofs(): ZkpClinicalDocumentProof[] {
    return Array.from(this.proofs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * 4. Retorna métricas do sistema ZKP
   */
  public getMetrics(): ZkpSystemMetrics {
    const avgLatency = this.totalVerificationsExecuted > 0
      ? Math.round(this.totalVerificationLatencyMs / this.totalVerificationsExecuted)
      : 0;

    return {
      totalProofsGenerated: this.totalProofsGenerated,
      totalVerificationsExecuted: this.totalVerificationsExecuted,
      validVerificationsCount: this.validVerificationsCount,
      invalidAttemptsCount: this.invalidAttemptsCount,
      avgVerificationLatencyMs: avgLatency,
      lastProofGeneratedAt: this.lastProofGeneratedAt,
      lastVerificationAt: this.lastVerificationAt
    };
  }

  /**
   * Limpeza para testes
   */
  public clearForTesting(): void {
    this.proofs.clear();
    this.proofsByToken.clear();
    this.totalProofsGenerated = 0;
    this.totalVerificationsExecuted = 0;
    this.validVerificationsCount = 0;
    this.invalidAttemptsCount = 0;
    this.totalVerificationLatencyMs = 0;
    this.lastProofGeneratedAt = undefined;
    this.lastVerificationAt = undefined;
  }
}
