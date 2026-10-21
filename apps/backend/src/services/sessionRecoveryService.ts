import crypto from 'crypto';
import {
  AuditAction,
  AuditResourceType,
  ClinicalSessionState,
  DisconnectionCause,
  SessionRecoveryGrade,
  type ClinicalSessionRecoverySession,
  type SessionStateSnapshot,
  type EncryptedSessionSnapshot,
  type SessionRecoveryMetrics,
  type StartSessionMonitoringDTO,
  type AttemptSessionReconnectDTO
} from '@terapiainfoco/shared';
import {
  generateReconnectionToken,
  verifyReconnectionToken,
  encryptSessionSnapshot,
  decryptSessionSnapshot,
  calculateSessionEventDigest,
  evaluateRecoveryGrade
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class SessionRecoveryService {
  private static instance: SessionRecoveryService;

  private sessions = new Map<string, ClinicalSessionRecoverySession>();
  private reconnectionSecrets = new Map<string, string>();
  private rawSnapshots = new Map<string, SessionStateSnapshot>();

  // Agregadores para métricas
  private totalMonitoredSessions = 0;
  private successfullyReconnectedCount = 0;
  private terminatedTimeoutCount = 0;
  private totalReconnectionSeconds = 0;
  private lastEventAt?: string;

  public static getInstance(): SessionRecoveryService {
    if (!SessionRecoveryService.instance) {
      SessionRecoveryService.instance = new SessionRecoveryService();
    }
    return SessionRecoveryService.instance;
  }

  /**
   * 1. Inicia monitoramento de resiliência e estado para uma sessão de teleatendimento
   */
  public async startSession(params: {
    therapistId: string;
    dto: StartSessionMonitoringDTO;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: ClinicalSessionRecoverySession; reconnectionToken: string }> {
    const { sessionId, appointmentId, patientId, gracePeriodSeconds = 600 } = params.dto;

    // Segredo efêmero de 32 bytes para assinatura HMAC do token desta sessão
    const secret = crypto.randomBytes(32).toString('hex');
    this.reconnectionSecrets.set(sessionId, secret);

    const now = new Date().toISOString();
    const initialSnapshot: SessionStateSnapshot = {
      elapsedSeconds: params.dto.initialSnapshot?.elapsedSeconds ?? 0,
      clinicalNotesDraft: params.dto.initialSnapshot?.clinicalNotesDraft ?? '',
      soapSubjectiveDraft: params.dto.initialSnapshot?.soapSubjectiveDraft ?? '',
      micMuted: params.dto.initialSnapshot?.micMuted ?? false,
      camMuted: params.dto.initialSnapshot?.camMuted ?? false,
      activeParticipants: params.dto.initialSnapshot?.activeParticipants ?? [params.therapistId],
      lastHeartbeatAt: now,
      sequenceNumber: 1
    };

    this.rawSnapshots.set(sessionId, initialSnapshot);

    // Cifra o snapshot inicial com AES-256-GCM
    const encryptedSnapshot = encryptSessionSnapshot(initialSnapshot, secret);

    // Gera token de reconexão HMAC inicial
    const tokenGen = generateReconnectionToken({
      sessionId,
      therapistId: params.therapistId,
      secret,
      ttlSeconds: gracePeriodSeconds
    });

    const probatoryDigest = calculateSessionEventDigest({
      sessionId,
      eventType: 'SESSION_MONITORED_START',
      timestamp: now,
      therapistId: params.therapistId,
      sequenceNumber: 1,
      snapshotDigest: encryptedSnapshot.snapshotDigest
    });

    const session: ClinicalSessionRecoverySession = {
      sessionId,
      appointmentId,
      therapistId: params.therapistId,
      patientId,
      state: ClinicalSessionState.ACTIVE_CONNECTED,
      startedAt: now,
      lastHeartbeatAt: now,
      heartbeatCount: 1,
      gracePeriodSeconds,
      reconnectionAttempts: 0,
      reconnectionTokenHash: tokenGen.tokenHash,
      encryptedSnapshot,
      probatoryDigest
    };

    this.sessions.set(sessionId, session);
    this.totalMonitoredSessions++;
    this.lastEventAt = now;

    // Trilha de auditoria WORM
    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.CLINICAL_SESSION_RECOVERY,
      resourceId: sessionId,
      action: AuditAction.CLINICAL_SESSION_MONITORED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return {
      session,
      reconnectionToken: tokenGen.token
    };
  }

  /**
   * 2. Registra batimento cardíaco (Heartbeat) e preserva snapshot incremental
   */
  public recordHeartbeat(params: {
    sessionId: string;
    therapistId: string;
    snapshot?: Partial<SessionStateSnapshot>;
  }): ClinicalSessionRecoverySession {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão ${params.sessionId} não encontrada.`);
    }

    const secret = this.reconnectionSecrets.get(params.sessionId);
    if (!secret) {
      throw new Error(`Chave de segurança da sessão ${params.sessionId} não encontrada.`);
    }

    const now = new Date().toISOString();
    const currentSnapshot = this.rawSnapshots.get(params.sessionId) || {
      elapsedSeconds: 0,
      clinicalNotesDraft: '',
      soapSubjectiveDraft: '',
      micMuted: false,
      camMuted: false,
      activeParticipants: [params.therapistId],
      lastHeartbeatAt: now,
      sequenceNumber: 0
    };

    const updatedSnapshot: SessionStateSnapshot = {
      ...currentSnapshot,
      ...params.snapshot,
      lastHeartbeatAt: now,
      sequenceNumber: currentSnapshot.sequenceNumber + 1
    };

    this.rawSnapshots.set(params.sessionId, updatedSnapshot);
    const encryptedSnapshot = encryptSessionSnapshot(updatedSnapshot, secret);

    session.lastHeartbeatAt = now;
    session.heartbeatCount++;
    session.encryptedSnapshot = encryptedSnapshot;

    // Se estava em reconexão ou desconectado e o heartbeat voltou normalmente
    if (session.state === ClinicalSessionState.RECONNECTING || session.state === ClinicalSessionState.RECONNECTED) {
      session.state = ClinicalSessionState.ACTIVE_CONNECTED;
    }

    return session;
  }

  /**
   * 3. Dispara registro de desconexão abrupta (Manual ou Timeout de Heartbeat)
   */
  public async triggerDisconnection(params: {
    sessionId: string;
    therapistId: string;
    cause: DisconnectionCause;
    detail?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: ClinicalSessionRecoverySession; reconnectionToken: string }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão ${params.sessionId} não encontrada.`);
    }

    const secret = this.reconnectionSecrets.get(params.sessionId);
    if (!secret) {
      throw new Error(`Chave de segurança da sessão ${params.sessionId} não encontrada.`);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + session.gracePeriodSeconds * 1000).toISOString();

    // Emite token de contingência atualizado para reassunção
    const tokenGen = generateReconnectionToken({
      sessionId: params.sessionId,
      therapistId: params.therapistId,
      secret,
      ttlSeconds: session.gracePeriodSeconds
    });

    const probatoryDigest = calculateSessionEventDigest({
      sessionId: params.sessionId,
      eventType: `DISCONNECTED_${params.cause}`,
      timestamp: nowIso,
      therapistId: params.therapistId,
      sequenceNumber: session.heartbeatCount + 1,
      snapshotDigest: session.encryptedSnapshot?.snapshotDigest
    });

    session.state = ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT;
    session.disconnectionCause = params.cause;
    session.disconnectedAt = nowIso;
    session.gracePeriodExpiresAt = expiresAt;
    session.reconnectionTokenHash = tokenGen.tokenHash;
    session.probatoryDigest = probatoryDigest;
    this.lastEventAt = nowIso;

    // Auditoria WORM compulsória de queda/contingência clínica (CFP 011/2018)
    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.CLINICAL_SESSION_RECOVERY,
      resourceId: params.sessionId,
      action: AuditAction.CLINICAL_SESSION_DISCONNECTED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return {
      session,
      reconnectionToken: tokenGen.token
    };
  }

  /**
   * 4. Valida token de reconexão, restaura snapshot criptografado e retoma atendimento
   */
  public async attemptReconnect(params: {
    sessionId: string;
    therapistId: string;
    dto: AttemptSessionReconnectDTO;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    session: ClinicalSessionRecoverySession;
    restoredSnapshot: SessionStateSnapshot;
    recoveryGrade: SessionRecoveryGrade;
  }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão ${params.sessionId} não encontrada.`);
    }

    const secret = this.reconnectionSecrets.get(params.sessionId);
    if (!secret) {
      throw new Error(`Chave de segurança da sessão ${params.sessionId} não encontrada.`);
    }

    // 1. Valida criptograficamente o Reconnection Token
    const verification = verifyReconnectionToken(params.dto.reconnectionToken, secret, params.sessionId);
    if (!verification.valid) {
      session.reconnectionAttempts++;
      throw new Error(`Reconexão negada: ${verification.error}`);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 2. Verifica se a janela de tolerância ética expirou
    if (session.gracePeriodExpiresAt && new Date(session.gracePeriodExpiresAt).getTime() < now.getTime()) {
      session.state = ClinicalSessionState.TERMINATED_TIMEOUT;
      session.terminatedAt = nowIso;
      this.terminatedTimeoutCount++;

      AuditService.log({
        actorId: params.therapistId,
        resourceType: AuditResourceType.CLINICAL_SESSION_RECOVERY,
        resourceId: params.sessionId,
        action: AuditAction.CLINICAL_SESSION_TIMEOUT_TERMINATED,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });

      throw new Error('Janela de contingência esgotada (10 min). A sessão foi terminada por timeout ético CFP nº 011/2018.');
    }

    // 3. Calcula duração da desconexão e avalia o grau de qualidade
    let durationSeconds = 10;
    if (session.disconnectedAt) {
      durationSeconds = Math.max(1, Math.floor((now.getTime() - new Date(session.disconnectedAt).getTime()) / 1000));
    }

    const recoveryGrade = evaluateRecoveryGrade(durationSeconds, session.gracePeriodSeconds) as SessionRecoveryGrade;

    // 4. Decifra e restaura o snapshot volátil
    if (!session.encryptedSnapshot) {
      throw new Error('Snapshot criptografado não disponível para restauração.');
    }

    const restoredSnapshot = decryptSessionSnapshot(session.encryptedSnapshot, secret);

    // 5. Atualiza estado e emite selo de recuperação
    session.state = ClinicalSessionState.RECONNECTED;
    session.reconnectedAt = nowIso;
    session.recoveryGrade = recoveryGrade;
    session.reconnectionAttempts++;

    const probatoryDigest = calculateSessionEventDigest({
      sessionId: params.sessionId,
      eventType: `RECONNECTED_${recoveryGrade}`,
      timestamp: nowIso,
      therapistId: params.therapistId,
      sequenceNumber: session.heartbeatCount + 1,
      snapshotDigest: session.encryptedSnapshot.snapshotDigest
    });
    session.probatoryDigest = probatoryDigest;

    this.successfullyReconnectedCount++;
    this.totalReconnectionSeconds += durationSeconds;
    this.lastEventAt = nowIso;

    // Trilha WORM de reconexão bem-sucedida
    AuditService.log({
      actorId: params.therapistId,
      resourceType: AuditResourceType.CLINICAL_SESSION_RECOVERY,
      resourceId: params.sessionId,
      action: AuditAction.CLINICAL_SESSION_RECONNECTED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    return {
      session,
      restoredSnapshot,
      recoveryGrade
    };
  }

  /**
   * 5. Finaliza a consulta normalmente pelo terapeuta
   */
  public completeSession(params: {
    sessionId: string;
    therapistId: string;
    finalNotes?: string;
  }): ClinicalSessionRecoverySession {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Sessão ${params.sessionId} não encontrada.`);
    }

    session.state = ClinicalSessionState.COMPLETED_NORMALLY;
    session.terminatedAt = new Date().toISOString();
    return session;
  }

  /**
   * 6. Retorna métricas globais para observabilidade do painel clínico
   */
  public getMetrics(): SessionRecoveryMetrics {
    const sessionsList = Array.from(this.sessions.values());
    const activeConnectedCount = sessionsList.filter(s => s.state === ClinicalSessionState.ACTIVE_CONNECTED).length;
    const pendingReconnectCount = sessionsList.filter(s => s.state === ClinicalSessionState.DISCONNECTED_PENDING_RECONNECT).length;

    const totalResolved = this.successfullyReconnectedCount + this.terminatedTimeoutCount;
    const recoverySuccessRate = totalResolved > 0
      ? Math.round((this.successfullyReconnectedCount / totalResolved) * 100)
      : 100;

    const avgReconnectionTimeSeconds = this.successfullyReconnectedCount > 0
      ? Math.round(this.totalReconnectionSeconds / this.successfullyReconnectedCount)
      : 0;

    return {
      totalMonitoredSessions: this.totalMonitoredSessions,
      activeConnectedCount,
      pendingReconnectCount,
      successfullyReconnectedCount: this.successfullyReconnectedCount,
      terminatedTimeoutCount: this.terminatedTimeoutCount,
      avgReconnectionTimeSeconds,
      recoverySuccessRate,
      lastEventAt: this.lastEventAt
    };
  }

  /**
   * 7. Listagem de sessões
   */
  public listSessions(): ClinicalSessionRecoverySession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  /**
   * 8. Busca sessão por ID
   */
  public getSession(sessionId: string): ClinicalSessionRecoverySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Limpa estado em testes
   */
  public clearForTesting(): void {
    this.sessions.clear();
    this.reconnectionSecrets.clear();
    this.rawSnapshots.clear();
    this.totalMonitoredSessions = 0;
    this.successfullyReconnectedCount = 0;
    this.terminatedTimeoutCount = 0;
    this.totalReconnectionSeconds = 0;
    this.lastEventAt = undefined;
  }
}
