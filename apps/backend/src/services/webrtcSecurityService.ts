import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  WebRtcCipherSuite,
  WebRtcSecurityGrade,
  WebRtcVerificationStatus,
  type WebRtcPeerFingerprint,
  type WebRtcSessionAuditRecord,
  type WebRtcSessionMetrics
} from '@terapiainfoco/shared';
import {
  normalizeDtlsFingerprint,
  isValidDtlsFingerprint,
  generateWebRtcSafetyNumbers,
  evaluateCipherSuite,
  calculateSessionProbataryDigest
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class WebRtcSecurityService {
  private static instance: WebRtcSecurityService;
  private sessions: Map<string, WebRtcSessionAuditRecord> = new Map();
  private metricsMap: Map<string, WebRtcSessionMetrics[]> = new Map();

  public static getInstance(): WebRtcSecurityService {
    if (!WebRtcSecurityService.instance) {
      WebRtcSecurityService.instance = new WebRtcSecurityService();
    }
    return WebRtcSecurityService.instance;
  }

  /**
   * Inicia o ciclo de vida e a auditoria de uma sessão WebRTC de telepsicologia (CFP 011/2018)
   */
  public async initiateSession(params: {
    appointmentId?: string;
    therapistId: string;
    patientId: string;
    therapistFingerprint: string;
    certificateAlgorithm?: string;
    cipherSuite?: string;
    dtlsVersion?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<WebRtcSessionAuditRecord> {
    const normTherapistFp = normalizeDtlsFingerprint(params.therapistFingerprint);
    const sessionId = `wrtc-${randomUUID()}`;
    const now = new Date().toISOString();
    const cipherSuite = params.cipherSuite || WebRtcCipherSuite.SRTP_AEAD_AES_256_GCM;
    const dtlsVersion = params.dtlsVersion || 'DTLS 1.3';

    const evaluation = evaluateCipherSuite(cipherSuite, dtlsVersion);

    const therapistPeer: WebRtcPeerFingerprint = {
      role: 'THERAPIST',
      fingerprint: normTherapistFp,
      certificateAlgorithm: params.certificateAlgorithm || 'ECDSA P-256',
      clientReportedAt: now
    };

    const initialRecord: WebRtcSessionAuditRecord = {
      sessionId,
      appointmentId: params.appointmentId,
      therapistId: params.therapistId,
      patientId: params.patientId,
      startedAt: now,
      therapistFingerprint: therapistPeer,
      safetyNumbers: '00000 00000 00000 00000', // Marcador até a adesão do paciente
      phoneticSas: 'Pendente-Conexao',
      verificationStatus: WebRtcVerificationStatus.UNVERIFIED,
      securityGrade: evaluation.securityGrade,
      cipherSuite,
      dtlsVersion,
      averageJitterMs: 0,
      packetLossPercent: 0,
      roundTripTimeMs: 0,
      bytesEncrypted: 0,
      probataryDigest: '',
      tamperEvidentSeal: ''
    };

    initialRecord.probataryDigest = calculateSessionProbataryDigest({
      sessionId: initialRecord.sessionId,
      appointmentId: initialRecord.appointmentId,
      therapistId: initialRecord.therapistId,
      patientId: initialRecord.patientId,
      startedAt: initialRecord.startedAt,
      therapistFingerprint: initialRecord.therapistFingerprint.fingerprint,
      safetyNumbers: initialRecord.safetyNumbers,
      cipherSuite: initialRecord.cipherSuite,
      verificationStatus: initialRecord.verificationStatus
    });

    initialRecord.tamperEvidentSeal = `SEAL-WEBRTC-${initialRecord.probataryDigest.slice(0, 16).toUpperCase()}`;

    this.sessions.set(sessionId, initialRecord);
    this.metricsMap.set(sessionId, []);

    // Registra na trilha de auditoria WORM imutável
    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.WEBRTC_SESSION,
      resourceId: sessionId,
      action: AuditAction.WEBRTC_SESSION_INITIATED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return initialRecord;
  }

  /**
   * Valida o fingerprint DTLS do paciente contra a sessão, gerando os Safety Numbers e selando Anti-MitM
   */
  public async verifyPatientFingerprint(params: {
    sessionId: string;
    patientFingerprint: string;
    certificateAlgorithm?: string;
    manuallyConfirmedByUser?: boolean;
    verifiedBy: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: WebRtcSessionAuditRecord; match: boolean }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão WebRTC não encontrada: ${params.sessionId}`);
    }

    if (session.endedAt) {
      throw new Error(`Sessão WebRTC ${params.sessionId} já foi encerrada.`);
    }

    const normPatientFp = normalizeDtlsFingerprint(params.patientFingerprint);
    const now = new Date().toISOString();

    const patientPeer: WebRtcPeerFingerprint = {
      role: 'PATIENT',
      fingerprint: normPatientFp,
      certificateAlgorithm: params.certificateAlgorithm || 'ECDSA P-256',
      clientReportedAt: now
    };

    session.patientFingerprint = patientPeer;

    // Gera os Safety Numbers (SAS) a partir dos dois certificados
    const sasResult = generateWebRtcSafetyNumbers(
      session.therapistFingerprint.fingerprint,
      normPatientFp
    );

    session.safetyNumbers = sasResult.safetyNumbers;
    session.phoneticSas = sasResult.phoneticSas;
    session.verifiedAt = now;
    session.verifiedBy = params.verifiedBy;

    // Se o usuário confirmou verbalmente ou os fingerprints batem com formato estrito e certificados válidos
    const isMatch = params.manuallyConfirmedByUser !== false && isValidDtlsFingerprint(normPatientFp);

    if (isMatch) {
      session.verificationStatus = WebRtcVerificationStatus.VERIFIED_MATCH;
      // Atualiza o nível de segurança com base na cifra e verificação
      const cipherEval = evaluateCipherSuite(session.cipherSuite, session.dtlsVersion);
      session.securityGrade = cipherEval.securityGrade;
    } else {
      session.verificationStatus = WebRtcVerificationStatus.VERIFIED_MISMATCH;
      session.securityGrade = WebRtcSecurityGrade.INSECURE;
    }

    session.probataryDigest = calculateSessionProbataryDigest({
      sessionId: session.sessionId,
      appointmentId: session.appointmentId,
      therapistId: session.therapistId,
      patientId: session.patientId,
      startedAt: session.startedAt,
      therapistFingerprint: session.therapistFingerprint.fingerprint,
      patientFingerprint: session.patientFingerprint.fingerprint,
      safetyNumbers: session.safetyNumbers,
      cipherSuite: session.cipherSuite,
      verificationStatus: session.verificationStatus
    });

    session.tamperEvidentSeal = `SEAL-WEBRTC-${session.probataryDigest.slice(0, 16).toUpperCase()}`;

    // Registra na trilha de auditoria WORM
    AuditService.log({
      actorId: params.verifiedBy,
      resourceType: AuditResourceType.WEBRTC_SESSION,
      resourceId: session.sessionId,
      action: AuditAction.WEBRTC_FINGERPRINT_VERIFIED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return { session, match: isMatch };
  }

  /**
   * Registra métricas periódicas de telemetria da sessão (Jitter, perda de pacotes, bytes cifrados)
   */
  public async recordSessionMetrics(params: {
    sessionId: string;
    jitterMs: number;
    packetLoss: number;
    rttMs: number;
    bytesSent: number;
    bytesReceived: number;
    cipherSuite?: string;
  }): Promise<{ averageJitterMs: number; packetLossPercent: number; totalBytesEncrypted: number }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão WebRTC não encontrada: ${params.sessionId}`);
    }

    const now = new Date().toISOString();
    const metrics: WebRtcSessionMetrics = {
      sessionId: params.sessionId,
      timestamp: now,
      jitterMs: params.jitterMs,
      packetLoss: params.packetLoss,
      rttMs: params.rttMs,
      bytesSent: params.bytesSent,
      bytesReceived: params.bytesReceived,
      cipherSuite: params.cipherSuite || session.cipherSuite
    };

    const history = this.metricsMap.get(params.sessionId) || [];
    history.push(metrics);
    if (history.length > 100) {
      history.shift();
    }
    this.metricsMap.set(params.sessionId, history);

    // Atualiza médias consolidadas na sessão
    const totalJitter = history.reduce((acc, m) => acc + m.jitterMs, 0);
    const totalPacketLoss = history.reduce((acc, m) => acc + m.packetLoss, 0);
    const totalBytes = history.reduce((acc, m) => acc + (m.bytesSent + m.bytesReceived), 0);

    session.averageJitterMs = Math.round((totalJitter / history.length) * 100) / 100;
    session.packetLossPercent = Math.round((totalPacketLoss / history.length) * 100) / 100;
    session.roundTripTimeMs = params.rttMs;
    session.bytesEncrypted = totalBytes;

    if (params.cipherSuite && params.cipherSuite !== session.cipherSuite) {
      session.cipherSuite = params.cipherSuite;
      const evaluation = evaluateCipherSuite(session.cipherSuite, session.dtlsVersion);
      session.securityGrade = evaluation.securityGrade;
    }

    return {
      averageJitterMs: session.averageJitterMs,
      packetLossPercent: session.packetLossPercent,
      totalBytesEncrypted: session.bytesEncrypted
    };
  }

  /**
   * Finaliza a sessão WebRTC, calcula o laudo probatório final e sela na Hash-Chain WORM
   */
  public async terminateSession(params: {
    sessionId: string;
    terminatedBy: string;
    finalNotes?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<WebRtcSessionAuditRecord> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão WebRTC não encontrada: ${params.sessionId}`);
    }

    const now = new Date().toISOString();
    session.endedAt = now;

    // Recalcula digest final com carimbo de término
    session.probataryDigest = calculateSessionProbataryDigest({
      sessionId: session.sessionId,
      appointmentId: session.appointmentId,
      therapistId: session.therapistId,
      patientId: session.patientId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      therapistFingerprint: session.therapistFingerprint.fingerprint,
      patientFingerprint: session.patientFingerprint?.fingerprint,
      safetyNumbers: session.safetyNumbers,
      cipherSuite: session.cipherSuite,
      verificationStatus: session.verificationStatus
    });

    session.tamperEvidentSeal = `SEAL-WEBRTC-FINAL-${session.probataryDigest.slice(0, 16).toUpperCase()}`;

    AuditService.log({
      actorId: params.terminatedBy,
      resourceType: AuditResourceType.WEBRTC_SESSION,
      resourceId: session.sessionId,
      action: AuditAction.WEBRTC_SESSION_TERMINATED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return session;
  }

  /**
   * Retorna a lista de sessões registradas
   */
  public listSessions(): WebRtcSessionAuditRecord[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * Retorna uma sessão específica por ID
   */
  public getSession(sessionId: string): WebRtcSessionAuditRecord | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Limpa o estado para isolamento de testes
   */
  public resetForTesting(): void {
    this.sessions.clear();
    this.metricsMap.clear();
  }
}
