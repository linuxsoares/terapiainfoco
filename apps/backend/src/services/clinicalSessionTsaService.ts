import {
  AuditAction,
  AuditResourceType,
  TsaAuthorityType,
  TimestampVerificationStatus,
  TimestampTamperType,
  type ClinicalSessionTimestampToken,
  type TimestampNotaryMetrics,
  type TimestampNotaryOverview,
  type TimestampVerificationResult,
  type CreateSessionTimestampDTO,
  type VerifySessionTimestampDTO,
  type SimulateTimestampTamperDTO,
  type SimulateTimestampTamperResponse,
  type TsaCertificateInfo
} from '@terapiainfoco/shared';
import {
  OID_ICP_BRASIL_TSA_POLICY,
  OID_INTERNAL_TSA_POLICY,
  OID_FEDERATED_TSA_POLICY,
  DEFAULT_ICP_BRASIL_ACT_CERT,
  createClinicalSessionImprint,
  createTimestampRequest,
  issueTimestampToken,
  verifyTimestampToken,
  simulateTimestampTampering
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class ClinicalSessionTsaService {
  private static instance: ClinicalSessionTsaService;

  private tokens: Map<string, ClinicalSessionTimestampToken> = new Map();
  private sessionToTokenMap: Map<string, string> = new Map();
  private tsaCertificate: TsaCertificateInfo = { ...DEFAULT_ICP_BRASIL_ACT_CERT };
  private activePolicyOid: string = OID_ICP_BRASIL_TSA_POLICY;

  private metrics: TimestampNotaryMetrics = {
    totalStampsIssued: 0,
    validStampsCount: 0,
    tamperingAttemptsBlocked: 0,
    icpBrasilStampsCount: 0,
    avgIssuanceLatencyMs: 14,
    lastStampTimestamp: undefined
  };

  private constructor() {
    this.seedDemoData();
  }

  public static getInstance(): ClinicalSessionTsaService {
    if (!ClinicalSessionTsaService.instance) {
      ClinicalSessionTsaService.instance = new ClinicalSessionTsaService();
    }
    return ClinicalSessionTsaService.instance;
  }

  /**
   * Inicializa dados de demonstração notarial com sessões clínicas carimbadas pela ACT ICP-Brasil
   */
  public seedDemoData(): void {
    this.tokens.clear();
    this.sessionToTokenMap.clear();

    const now = Date.now();

    // 1. Sessão clínica recente carimbada
    const demo1 = this.createInternalStamp({
      sessionId: 'sess_clinical_rec_001',
      patientBlindIndex: 'bidx_pat_9a4f2e1c8d7b3a5e',
      therapistId: 'therapist_claudio_01',
      therapistCrp: 'CRP-06/123456',
      sessionStartTime: new Date(now - 3600000 * 2).toISOString(),
      sessionEndTime: new Date(now - 3600000 * 2 + 3000000).toISOString(),
      clinicalSummaryOrHash: 'sha256_soap_note_paciente_ansiedade_generalizada_v1'
    });

    // 2. Sessão clínica de emergência carimbada
    const demo2 = this.createInternalStamp({
      sessionId: 'sess_clinical_rec_002',
      patientBlindIndex: 'bidx_pat_3c7d1e8a9b2f4a6c',
      therapistId: 'therapist_claudio_01',
      therapistCrp: 'CRP-06/123456',
      sessionStartTime: new Date(now - 3600000 * 24).toISOString(),
      sessionEndTime: new Date(now - 3600000 * 24 + 3000000).toISOString(),
      clinicalSummaryOrHash: 'sha256_soap_note_crise_panico_acolhimento_urgencia'
    });

    // 3. Sessão clínica histórica com retificação SOAP carimbada
    const demo3 = this.createInternalStamp({
      sessionId: 'sess_clinical_rec_003',
      patientBlindIndex: 'bidx_pat_6f5e4d3c2b1a0e9d',
      therapistId: 'therapist_claudio_01',
      therapistCrp: 'CRP-06/123456',
      sessionStartTime: new Date(now - 3600000 * 72).toISOString(),
      sessionEndTime: new Date(now - 3600000 * 72 + 3000000).toISOString(),
      clinicalSummaryOrHash: 'sha256_soap_rectification_notary_block_sealed'
    });

    this.metrics = {
      totalStampsIssued: 142,
      validStampsCount: 142,
      tamperingAttemptsBlocked: 3,
      icpBrasilStampsCount: 142,
      avgIssuanceLatencyMs: 12.8,
      lastStampTimestamp: demo1.issuedAt
    };
  }

  private createInternalStamp(params: {
    sessionId: string;
    patientBlindIndex: string;
    therapistId: string;
    therapistCrp: string;
    sessionStartTime: string;
    sessionEndTime: string;
    clinicalSummaryOrHash?: string;
  }): ClinicalSessionTimestampToken {
    const imprint = createClinicalSessionImprint(params);
    const req = createTimestampRequest({
      sessionId: params.sessionId,
      patientBlindIndex: params.patientBlindIndex,
      therapistId: params.therapistId,
      therapistCrp: params.therapistCrp,
      messageImprint: imprint,
      reqPolicyOid: this.activePolicyOid
    });

    const token = issueTimestampToken(req, {
      tsaCert: this.tsaCertificate
    });

    this.tokens.set(token.tokenId, token);
    this.sessionToTokenMap.set(params.sessionId, token.tokenId);
    return token;
  }

  /**
   * Retorna visão executiva das certificações notariais de sessão clínica
   */
  public getOverview(): TimestampNotaryOverview {
    const recentTokens = Array.from(this.tokens.values())
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      .slice(0, 10);

    return {
      metrics: { ...this.metrics },
      tsaCertificate: this.tsaCertificate,
      recentTokens,
      activePolicyOid: this.activePolicyOid
    };
  }

  /**
   * Emite um carimbo do tempo oficial RFC 3161 ICP-Brasil para a sessão clínica
   */
  public async issueSessionTimestamp(
    dto: CreateSessionTimestampDTO,
    actorId: string = 'system_tsa_service'
  ): Promise<ClinicalSessionTimestampToken> {
    const startMs = Date.now();

    // Normalização de blind index para conformidade LGPD
    const patientBlindIndex = dto.patientId.startsWith('bidx_')
      ? dto.patientId
      : `bidx_pat_${dto.patientId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;

    const imprint = createClinicalSessionImprint({
      sessionId: dto.sessionId,
      patientBlindIndex,
      therapistId: dto.therapistId,
      therapistCrp: dto.therapistCrp,
      sessionStartTime: dto.sessionStartTime,
      sessionEndTime: dto.sessionEndTime,
      clinicalSummaryOrHash: dto.clinicalSummaryOrHash
    });

    const policyOid = dto.policyOid || this.activePolicyOid;
    const req = createTimestampRequest({
      sessionId: dto.sessionId,
      patientBlindIndex,
      therapistId: dto.therapistId,
      therapistCrp: dto.therapistCrp,
      messageImprint: imprint,
      reqPolicyOid: policyOid
    });

    const token = issueTimestampToken(req, {
      tsaCert: this.tsaCertificate
    });

    this.tokens.set(token.tokenId, token);
    this.sessionToTokenMap.set(dto.sessionId, token.tokenId);

    const latency = Date.now() - startMs;
    this.metrics.totalStampsIssued += 1;
    this.metrics.validStampsCount += 1;
    if (this.tsaCertificate.authorityType === TsaAuthorityType.ICP_BRASIL_ACT) {
      this.metrics.icpBrasilStampsCount += 1;
    }
    this.metrics.avgIssuanceLatencyMs = Math.round(
      (this.metrics.avgIssuanceLatencyMs * 0.9 + latency * 0.1) * 10
    ) / 10;
    this.metrics.lastStampTimestamp = token.issuedAt;

    // Registro na trilha WORM
    AuditService.log({
      action: AuditAction.CLINICAL_SESSION_TIMESTAMP_ISSUED,
      resourceType: AuditResourceType.CLINICAL_SESSION_TSA_NOTARY,
      resourceId: token.tokenId,
      actorId,
      ipAddress: '127.0.0.1',
      userAgent: 'TerapiaInFoco-TSA-Notary/1.0'
    });

    return token;
  }

  /**
   * Executa a verificação pericial forense de um token de carimbo do tempo
   */
  public async verifyToken(
    dto: VerifySessionTimestampDTO,
    actorId: string = 'system_verifier'
  ): Promise<TimestampVerificationResult> {
    let tokenTarget: ClinicalSessionTimestampToken | string | undefined;

    if (dto.tokenId && this.tokens.has(dto.tokenId)) {
      tokenTarget = this.tokens.get(dto.tokenId);
    } else if (dto.sessionId && this.sessionToTokenMap.has(dto.sessionId)) {
      const tid = this.sessionToTokenMap.get(dto.sessionId)!;
      tokenTarget = this.tokens.get(tid);
    } else if (dto.rawTokenBase64) {
      tokenTarget = dto.rawTokenBase64;
    }

    if (!tokenTarget) {
      return {
        isValid: false,
        status: TimestampVerificationStatus.SIGNATURE_INVALID,
        sessionId: dto.sessionId || 'unknown',
        tokenId: dto.tokenId || 'unknown',
        verifiedAt: new Date().toISOString(),
        messageImprintMatch: false,
        signatureValid: false,
        nonceMatch: false,
        certificateValid: false,
        driftMilliseconds: 0,
        details: 'Token de carimbo do tempo não encontrado nos registros e payload não fornecido'
      };
    }

    let expectedImprint = dto.expectedImprint;
    if (!expectedImprint && dto.sessionData) {
      const imprint = createClinicalSessionImprint({
        sessionId: dto.sessionData.sessionId,
        patientBlindIndex: dto.sessionData.patientBlindIndex,
        therapistId: dto.sessionData.therapistId,
        therapistCrp: dto.sessionData.therapistCrp,
        sessionStartTime: dto.sessionData.sessionStartTime,
        sessionEndTime: dto.sessionData.sessionEndTime,
        clinicalSummaryOrHash: dto.sessionData.clinicalSummaryOrHash
      });
      expectedImprint = imprint.hashedMessage;
    }

    const verification = verifyTimestampToken({
      token: tokenTarget,
      expectedImprint,
      tsaCert: this.tsaCertificate
    });

    if (!verification.isValid) {
      this.metrics.tamperingAttemptsBlocked += 1;
      // Registro na trilha WORM de tentativa de adulteração detectada
      AuditService.log({
        action: AuditAction.CLINICAL_SESSION_TIMESTAMP_TAMPERED,
        resourceType: AuditResourceType.CLINICAL_SESSION_TSA_NOTARY,
        resourceId: verification.tokenId,
        actorId,
        ipAddress: '127.0.0.1',
        userAgent: 'TerapiaInFoco-Forensic-Verifier/1.0'
      });
    } else {
      // Registro de verificação com sucesso
      AuditService.log({
        action: AuditAction.CLINICAL_SESSION_TIMESTAMP_VERIFIED,
        resourceType: AuditResourceType.CLINICAL_SESSION_TSA_NOTARY,
        resourceId: verification.tokenId,
        actorId,
        ipAddress: '127.0.0.1',
        userAgent: 'TerapiaInFoco-Forensic-Verifier/1.0'
      });
    }

    return verification;
  }

  /**
   * Simula adulteração para comprovação de detecção pericial de fraude
   */
  public async simulateTampering(
    dto: SimulateTimestampTamperDTO,
    actorId: string = 'forensic_pentester'
  ): Promise<SimulateTimestampTamperResponse> {
    const token = this.tokens.get(dto.tokenId);
    if (!token) {
      throw new Error(`Token ${dto.tokenId} não encontrado para teste pericial de adulteração`);
    }

    // Verificação prévia legítima
    const verificationBefore = verifyTimestampToken({
      token,
      tsaCert: this.tsaCertificate
    });

    // Gera token corrompido
    const tamperedTokenBase64 = simulateTimestampTampering(token, dto.tamperType);

    // Verificação pericial no token adulterado
    const verificationAfter = verifyTimestampToken({
      token: tamperedTokenBase64,
      tsaCert: this.tsaCertificate
    });

    this.metrics.tamperingAttemptsBlocked += 1;

    // Registra na trilha WORM
    AuditService.log({
      action: AuditAction.CLINICAL_SESSION_TIMESTAMP_TAMPERED,
      resourceType: AuditResourceType.CLINICAL_SESSION_TSA_NOTARY,
      resourceId: token.tokenId,
      actorId,
      ipAddress: '127.0.0.1',
      userAgent: 'TerapiaInFoco-Forensic-Pentest/1.0'
    });

    return {
      success: true,
      tamperedTokenBase64,
      tamperType: dto.tamperType,
      verificationBefore,
      verificationAfter,
      message: `Simulação de adulteração '${dto.tamperType}' concluída com detecção forense imediata: status '${verificationAfter.status}'`
    };
  }

  /**
   * Consulta token de carimbo pelo ID da sessão
   */
  public getTokenBySessionId(sessionId: string): ClinicalSessionTimestampToken | null {
    const tokenId = this.sessionToTokenMap.get(sessionId);
    if (!tokenId) return null;
    return this.tokens.get(tokenId) || null;
  }

  /**
   * Retorna os detalhes da autoridade de carimbo credenciada e OIDs suportados
   */
  public getTsaInfo(): {
    tsaCertificate: TsaCertificateInfo;
    activePolicyOid: string;
    supportedOids: Array<{ oid: string; description: string }>;
  } {
    return {
      tsaCertificate: this.tsaCertificate,
      activePolicyOid: this.activePolicyOid,
      supportedOids: [
        {
          oid: OID_ICP_BRASIL_TSA_POLICY,
          description: 'Política Geral de Carimbo do Tempo ICP-Brasil (DOC-ICP-11)'
        },
        {
          oid: OID_INTERNAL_TSA_POLICY,
          description: 'Política Corporativa de Alta Tempestividade TerapiaInFoco'
        },
        {
          oid: OID_FEDERATED_TSA_POLICY,
          description: 'Política de Federação Interoperável em Saúde Mental (RFC-001 §3.5)'
        }
      ]
    };
  }
}
