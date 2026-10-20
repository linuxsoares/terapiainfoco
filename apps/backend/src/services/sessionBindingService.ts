import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditResourceType,
  SessionBindingMode,
  SessionLifecycleStatus,
  SessionDeviceType,
  type ClinicalActiveSession,
  type SessionRevocationProof,
  type SessionManagementOverview,
  type TerminateSessionDTO,
  type TerminateSessionResponse,
  type TerminateAllOtherSessionsDTO,
  type TerminateAllOtherSessionsResponse,
  type SimulateConcurrentLoginDTO,
  type SimulateConcurrentLoginResponse,
  type VerifyDpopBindingDTO,
  type VerifyDpopBindingResponse,
  type DpopVerificationResult
} from '@terapiainfoco/shared';
import {
  generateClientDeviceKeyPair,
  generateSessionRevocationProof,
  verifySessionRevocationProof,
  verifyDpopProof
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class SessionBindingService {
  private static instance: SessionBindingService;
  private sessions: Map<string, ClinicalActiveSession> = new Map();
  private maxAllowedConcurrentDefault = 2;

  private constructor() {
    this.seedDemoSessions();
  }

  public static getInstance(): SessionBindingService {
    if (!SessionBindingService.instance) {
      SessionBindingService.instance = new SessionBindingService();
    }
    return SessionBindingService.instance;
  }

  /**
   * Inicializa sessões clínicas ativas para o terapeuta de demonstração
   */
  public seedDemoSessions(): void {
    this.sessions.clear();

    const kp1 = generateClientDeviceKeyPair();
    const kp2 = generateClientDeviceKeyPair();
    const kp3 = generateClientDeviceKeyPair();

    const now = Date.now();

    // 1. Sessão Atual (Desktop Chrome macOS)
    const session1: ClinicalActiveSession = {
      sessionId: 'sess-active-chrome-01',
      userId: 'user-therapist-001',
      therapistCrp: '06/12345',
      deviceType: SessionDeviceType.DESKTOP_CHROME,
      deviceName: 'MacBook Pro 16" (macOS / Chrome 129)',
      ipAddress: '189.120.45.10',
      location: 'São Paulo, SP - BR',
      bindingMode: SessionBindingMode.STRICT_DPOP,
      clientJkt: kp1.thumbprint,
      status: SessionLifecycleStatus.ACTIVE,
      createdAt: new Date(now - 3600000 * 2).toISOString(),
      lastActivityAt: new Date(now - 60000 * 2).toISOString(),
      isCurrentDevice: true
    };

    // 2. Sessão Mobile (iPhone iOS Safari)
    const session2: ClinicalActiveSession = {
      sessionId: 'sess-active-ios-02',
      userId: 'user-therapist-001',
      therapistCrp: '06/12345',
      deviceType: SessionDeviceType.MOBILE_IOS,
      deviceName: 'iPhone 15 Pro (iOS 17.5 / Safari)',
      ipAddress: '177.18.230.88',
      location: 'Campinas, SP - BR',
      bindingMode: SessionBindingMode.STRICT_DPOP,
      clientJkt: kp2.thumbprint,
      status: SessionLifecycleStatus.ACTIVE,
      createdAt: new Date(now - 3600000 * 24).toISOString(),
      lastActivityAt: new Date(now - 3600000 * 3).toISOString(),
      isCurrentDevice: false
    };

    // 3. Sessão Anterior Revogada (Firefox Windows)
    const revokedAt = new Date(now - 3600000 * 48).toISOString();
    const session3Draft: ClinicalActiveSession = {
      sessionId: 'sess-revoked-firefox-03',
      userId: 'user-therapist-001',
      therapistCrp: '06/12345',
      deviceType: SessionDeviceType.DESKTOP_FIREFOX,
      deviceName: 'Dell XPS 13 (Windows 11 / Firefox 125)',
      ipAddress: '201.83.112.5',
      location: 'Belo Horizonte, MG - BR',
      bindingMode: SessionBindingMode.STRICT_DPOP,
      clientJkt: kp3.thumbprint,
      status: SessionLifecycleStatus.TERMINATED_BY_USER,
      createdAt: new Date(now - 3600000 * 72).toISOString(),
      lastActivityAt: revokedAt,
      isCurrentDevice: false,
      revokedAt,
      revocationReason: 'Encerramento preventivo por auditoria forense WORM'
    };

    const seal = generateSessionRevocationProof(session3Draft);
    session3Draft.revocationProofSeal = seal;

    this.sessions.set(session1.sessionId, session1);
    this.sessions.set(session2.sessionId, session2);
    this.sessions.set(session3Draft.sessionId, session3Draft);
  }

  /**
   * Lista todas as sessões do terapeuta, identificando a sessão corrente
   */
  public listSessions(userId = 'user-therapist-001', currentSessionId = 'sess-active-chrome-01'): ClinicalActiveSession[] {
    const list: ClinicalActiveSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        list.push({
          ...session,
          isCurrentDevice: session.sessionId === currentSessionId
        });
      }
    }
    // Ordena: ativas primeiro, depois por mais recente
    return list.sort((a, b) => {
      if (a.status === SessionLifecycleStatus.ACTIVE && b.status !== SessionLifecycleStatus.ACTIVE) return -1;
      if (a.status !== SessionLifecycleStatus.ACTIVE && b.status === SessionLifecycleStatus.ACTIVE) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * Visão Geral Executiva dos Parâmetros de Token Binding e Concorrência
   */
  public getOverview(userId = 'user-therapist-001'): SessionManagementOverview {
    const sessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    const activeSessions = sessions.filter(s => s.status === SessionLifecycleStatus.ACTIVE);
    const boundWithDpop = activeSessions.filter(s => s.bindingMode === SessionBindingMode.STRICT_DPOP);
    const revocations = sessions.filter(
      s => s.status === SessionLifecycleStatus.TERMINATED_BY_USER ||
           s.status === SessionLifecycleStatus.REVOKED_CONCURRENT_LIMIT ||
           s.status === SessionLifecycleStatus.FORCE_KILLED_ADMIN
    );

    const dpopBoundPercentage = activeSessions.length > 0
      ? Math.round((boundWithDpop.length / activeSessions.length) * 100)
      : 100;

    return {
      totalActiveSessions: activeSessions.length,
      totalProtectedUsers: 1,
      dpopBoundPercentage,
      concurrencyLimitPerTherapist: this.maxAllowedConcurrentDefault,
      recentRevocationsCount: revocations.length,
      activeSessions
    };
  }

  /**
   * Revoga forçadamente uma sessão individual com emissão de selo WORM
   */
  public async terminateSession(
    dto: TerminateSessionDTO,
    operator = 'user-therapist-001',
    ipAddress = '189.120.45.10'
  ): Promise<TerminateSessionResponse> {
    const session = this.sessions.get(dto.sessionId);
    if (!session) {
      throw new Error(`Sessão com ID ${dto.sessionId} não encontrada.`);
    }

    if (session.status !== SessionLifecycleStatus.ACTIVE && session.revocationProofSeal) {
      return {
        success: true,
        terminatedSessionId: session.sessionId,
        proofSeal: session.revocationProofSeal,
        message: 'Sessão já se encontrava previamente revogada.'
      };
    }

    const revokedAt = new Date().toISOString();
    session.status = SessionLifecycleStatus.TERMINATED_BY_USER;
    session.revokedAt = revokedAt;
    session.revocationReason = dto.reason || 'Revogação forçada de dispositivo sob demanda do terapeuta';

    const proofSeal = generateSessionRevocationProof(session);
    session.revocationProofSeal = proofSeal;
    session.lastActivityAt = revokedAt;
    this.sessions.set(session.sessionId, session);

    // Registro na trilha WORM
    AuditService.log({
      actorId: operator,
      resourceType: AuditResourceType.SESSION_MANAGEMENT,
      resourceId: session.sessionId,
      action: AuditAction.SESSION_FORCE_TERMINATED,
      ipAddress,
      userAgent: session.deviceName
    });

    return {
      success: true,
      terminatedSessionId: session.sessionId,
      proofSeal,
      message: 'Sessão revogada com sucesso e selo notarial probatório WORM emitido.'
    };
  }

  /**
   * Encerra todas as outras sessões ativas do terapeuta (Kill Switch Remoto)
   */
  public async terminateAllOtherSessions(
    dto: TerminateAllOtherSessionsDTO,
    operator = 'user-therapist-001',
    ipAddress = '189.120.45.10'
  ): Promise<TerminateAllOtherSessionsResponse> {
    const retainedSession = this.sessions.get(dto.currentSessionId);
    if (!retainedSession) {
      throw new Error(`Sessão principal ${dto.currentSessionId} não encontrada.`);
    }

    const userId = retainedSession.userId;
    const nowIso = new Date().toISOString();
    const terminatedIds: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (session.userId === userId && id !== dto.currentSessionId && session.status === SessionLifecycleStatus.ACTIVE) {
        session.status = SessionLifecycleStatus.FORCE_KILLED_ADMIN;
        session.revokedAt = nowIso;
        session.revocationReason = dto.reason || 'Encerramento em massa de sessões secundárias (Kill Switch Concorrente)';
        const proofSeal = generateSessionRevocationProof(session);
        session.revocationProofSeal = proofSeal;
        session.lastActivityAt = nowIso;
        this.sessions.set(id, session);
        terminatedIds.push(id);
      }
    }

    AuditService.log({
      actorId: operator,
      resourceType: AuditResourceType.SESSION_MANAGEMENT,
      resourceId: dto.currentSessionId,
      action: AuditAction.SESSION_ALL_OTHER_REVOKED,
      ipAddress,
      userAgent: retainedSession.deviceName
    });

    return {
      success: true,
      terminatedCount: terminatedIds.length,
      terminatedSessionIds: terminatedIds,
      message: `Foram revogadas ${terminatedIds.length} sessões ativas concorrentes com sucesso.`
    };
  }

  /**
   * Simula cenários de concorrência e tentativas de intrusão/replay attack
   */
  public async simulateConcurrentLogin(
    dto: SimulateConcurrentLoginDTO,
    ipAddress = '189.120.45.10'
  ): Promise<SimulateConcurrentLoginResponse> {
    const userId = dto.userId || 'user-therapist-001';
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Cenário 1: Replay Attack de Token sem chave vinculada correspondente
    if (dto.scenario === 'TOKEN_REPLAY_ATTACK') {
      AuditService.log({
        actorId: 'UNAUTHORIZED_ATTACKER',
        resourceType: AuditResourceType.SESSION_MANAGEMENT,
        resourceId: `replay-attempt-${userId}`,
        action: AuditAction.SESSION_DPOP_REJECTED,
        ipAddress: dto.ipAddress || '198.51.100.99',
        userAgent: dto.deviceName || 'Kali Linux / Rogue HTTP Client'
      });

      return {
        success: false,
        actionTaken: 'BLOCKED_TOKEN_BINDING_MISMATCH',
        message: 'Ataque de Replay interceptado com sucesso: a chave pública ECDSA P-256 do invasor difere do JWK Thumbprint vinculado ao token (RFC 9449).'
      };
    }

    // Cenário 2 & 3: Novo dispositivo ou limite excedido
    const activeSessions = Array.from(this.sessions.values()).filter(
      s => s.userId === userId && s.status === SessionLifecycleStatus.ACTIVE
    );

    let actionTaken: SimulateConcurrentLoginResponse['actionTaken'] = 'ALLOWED';
    let revokedSessionId: string | undefined;
    let proofSeal: string | undefined;

    // Se estiver no limite de concorrência (2) ou o cenário solicitar teste de limite
    if (activeSessions.length >= this.maxAllowedConcurrentDefault || dto.scenario === 'EXCEED_CONCURRENCY_LIMIT') {
      // Ordena pelas mais antigas para expulsão preventiva
      activeSessions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const victim = activeSessions[0];

      if (victim) {
        victim.status = SessionLifecycleStatus.REVOKED_CONCURRENT_LIMIT;
        victim.revokedAt = nowIso;
        victim.revocationReason = `Deslocamento forçado: limite de ${this.maxAllowedConcurrentDefault} sessões ativas concorrentes atingido (RFC-001 §4.4)`;
        victim.revocationProofSeal = generateSessionRevocationProof(victim);
        victim.lastActivityAt = nowIso;
        this.sessions.set(victim.sessionId, victim);

        revokedSessionId = victim.sessionId;
        proofSeal = victim.revocationProofSeal;
        actionTaken = 'REVOKED_OLDER_SESSION';

        AuditService.log({
          actorId: 'SYSTEM_CONCURRENCY_SENTINEL',
          resourceType: AuditResourceType.SESSION_MANAGEMENT,
          resourceId: victim.sessionId,
          action: AuditAction.SESSION_CONCURRENT_REVOKED,
          ipAddress: dto.ipAddress || ipAddress,
          userAgent: dto.deviceName || 'Concorrência Clínica Automática'
        });
      }
    }

    const kp = generateClientDeviceKeyPair();
    const newSessionId = `sess-concur-${randomUUID().slice(0, 8)}`;
    const newSession: ClinicalActiveSession = {
      sessionId: newSessionId,
      userId,
      therapistCrp: '06/12345',
      deviceType: SessionDeviceType.CLINICAL_WORKSTATION,
      deviceName: dto.deviceName || 'Estação Clínica Consultório 02 (Linux / Chrome)',
      ipAddress: dto.ipAddress || '200.140.80.30',
      location: 'Curitiba, PR - BR',
      bindingMode: SessionBindingMode.STRICT_DPOP,
      clientJkt: kp.thumbprint,
      status: SessionLifecycleStatus.ACTIVE,
      createdAt: nowIso,
      lastActivityAt: nowIso,
      isCurrentDevice: false
    };

    this.sessions.set(newSession.sessionId, newSession);

    AuditService.log({
      actorId: userId,
      resourceType: AuditResourceType.SESSION_MANAGEMENT,
      resourceId: newSession.sessionId,
      action: AuditAction.SESSION_BOUND_CREATED,
      ipAddress: newSession.ipAddress,
      userAgent: newSession.deviceName
    });

    return {
      success: true,
      actionTaken,
      session: newSession,
      revokedSessionId,
      proofSeal,
      message: actionTaken === 'REVOKED_OLDER_SESSION'
        ? `Nova sessão autorizada e vinculada. Sessão anterior mais antiga (${revokedSessionId}) foi revogada compulsoriamente pelo sentinela de concorrência.`
        : 'Nova sessão vinculada e autenticada com sucesso sob RFC 9449 DPoP.'
    };
  }

  /**
   * Valida a prova de posse DPoP recebida na requisição
   */
  public verifyDpopBinding(
    dto: VerifyDpopBindingDTO,
    actorId = 'user-therapist-001',
    ipAddress = '189.120.45.10'
  ): VerifyDpopBindingResponse {
    const result = verifyDpopProof(
      dto.dpopProof,
      dto.httpMethod,
      dto.httpUri,
      dto.accessToken
    );

    if (!result.isValid) {
      AuditService.log({
        actorId,
        resourceType: AuditResourceType.SESSION_MANAGEMENT,
        resourceId: result.clientThumbprint || 'unknown-thumbprint',
        action: AuditAction.SESSION_DPOP_REJECTED,
        ipAddress,
        userAgent: `DPoP Validation Error: ${result.error}`
      });
    }

    return {
      success: result.isValid,
      verification: result,
      message: result.isValid
        ? 'Prova de Posse DPoP válida e íntegra (RFC 9449).'
        : `Prova DPoP rejeitada: ${result.error}`
    };
  }

  /**
   * Verifica a validade pericial de um selo de revogação
   */
  public verifyRevocationSeal(sessionId: string): SessionRevocationProof {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada.`);
    }

    if (!session.revocationProofSeal) {
      throw new Error(`Sessão ${sessionId} não possui selo probatório de revogação.`);
    }

    return verifySessionRevocationProof(session.revocationProofSeal, session);
  }
}
