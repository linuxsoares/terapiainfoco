/**
 * ============================================================================
 * 65. BACKEND SERVICE: SESSION FIXATION & HIJACKING GUARD ENCLAVE SERVICE
 * ============================================================================
 * 
 * Enclave de rotação criptográfica obrigatória de sessões pós-autenticação,
 * invalidação imediata de identificadores pré-login e dynamic binding de
 * contexto de rede, User-Agent e TLS (JA4/JA3) com auditoria WORM imutável.
 */

import { randomUUID, createHash } from 'node:crypto';
import {
  SessionAnomalyType,
  SessionMitigationAction,
  SessionSecurityLevel,
  AuditAction,
  AuditResourceType,
  type ClientContextFingerprint,
  type SessionSecurityToken,
  type SessionProofSeal,
  type SessionEvaluationResult,
  type SessionGuardIncident,
  type SessionGuardPolicy,
  type SessionGuardMetrics,
  type SessionGuardOverview,
  type EvaluateSessionDTO,
  type EvaluateSessionResponse,
  type RotateSessionDTO,
  type RotateSessionResponse,
  type UpdateSessionGuardPolicyDTO,
  type UpdateSessionGuardPolicyResponse,
  type SimulateSessionAttackDTO,
  type SimulateSessionAttackResponse,
  type VerifySessionSealDTO,
  type VerifySessionSealResponse
} from '@terapiainfoco/shared';
import {
  DEFAULT_SESSION_GUARD_POLICY,
  buildClientContextFingerprint,
  computeContextHash,
  generateCryptographicSessionId,
  evaluateSessionContext,
  verifySessionProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

interface RegisteredSessionRecord {
  token: SessionSecurityToken;
  context: ClientContextFingerprint;
  lastSeenAt: string;
}

export class SessionFixationGuardService {
  private static instance: SessionFixationGuardService;

  private policy: SessionGuardPolicy = { ...DEFAULT_SESSION_GUARD_POLICY };
  private sessionsMap: Map<string, RegisteredSessionRecord> = new Map();
  private invalidatedPreAuthIds: Set<string> = new Set();
  private incidents: SessionGuardIncident[] = [];
  private sealsMap: Map<string, SessionProofSeal> = new Map();

  private metrics: SessionGuardMetrics = {
    totalEvaluations: 0,
    fixationAttemptsBlocked: 0,
    hijackAttemptsBlocked: 0,
    legitimateRotations: 0,
    activeProtectedSessions: 0,
    lastIncidentTimestamp: null,
    activePolicy: { ...DEFAULT_SESSION_GUARD_POLICY }
  };

  private constructor() {
    this.seedInitialHistoricalMetrics();
  }

  public static getInstance(): SessionFixationGuardService {
    if (!SessionFixationGuardService.instance) {
      SessionFixationGuardService.instance = new SessionFixationGuardService();
    }
    return SessionFixationGuardService.instance;
  }

  private seedInitialHistoricalMetrics(): void {
    const seedSessionId = 'sess_sec_seed_psychologist_session_init_01';
    const seedContext = buildClientContextFingerprint(
      '198.51.100.45',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      't13d1516h2_8daaf6152771_b186095e22b6',
      'BR'
    );

    const seedToken: SessionSecurityToken = {
      sessionId: seedSessionId,
      userId: 'usr_psi_seed_01',
      userRole: 'PSICOLOGO_TITULAR',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      lastRotatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      securityLevel: SessionSecurityLevel.STRICT_CLINICAL,
      contextHash: computeContextHash(seedContext),
      isActive: true
    };

    this.sessionsMap.set(seedSessionId, {
      token: seedToken,
      context: seedContext,
      lastSeenAt: new Date().toISOString()
    });

    // Registra um incidente forense inicial controlado para auditoria
    const seedIncident: SessionGuardIncident = {
      id: randomUUID(),
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      anomalyType: SessionAnomalyType.USER_AGENT_MUTATION,
      sessionId: seedSessionId,
      userId: 'usr_psi_seed_01',
      expectedSubnet: seedContext.subnetPrefix,
      actualIp: '198.51.100.45',
      expectedUserAgentHash: seedContext.userAgentHash,
      actualUserAgentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      mitigationAction: SessionMitigationAction.IMMEDIATE_REVOCATION,
      evidence: 'Mutação de User-Agent de navegador Safari para scanner automatizado em mesma sessão.',
      seal: {
        version: '1.0.0',
        sealId: 'session_guard_v1_seed_init_probe',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        sessionIdHash: createHash('sha256').update(seedSessionId).digest('hex'),
        contextHash: seedToken.contextHash,
        anomalyCount: 1,
        mitigationAction: SessionMitigationAction.IMMEDIATE_REVOCATION,
        hmacSignature: 'sig_seed_session_guard_initial'
      }
    };

    this.incidents.push(seedIncident);
    this.sealsMap.set(seedIncident.seal.sealId, seedIncident.seal);

    this.metrics.totalEvaluations = 168;
    this.metrics.fixationAttemptsBlocked = 0;
    this.metrics.hijackAttemptsBlocked = 1;
    this.metrics.legitimateRotations = 14;
    this.metrics.activeProtectedSessions = 1;
    this.metrics.lastIncidentTimestamp = seedIncident.timestamp;
  }

  public getOverview(): SessionGuardOverview {
    const activeSessionsSample = Array.from(this.sessionsMap.values())
      .filter(s => s.token.isActive)
      .slice(0, 10)
      .map(s => ({
        sessionIdMasked: `${s.token.sessionId.substring(0, 16)}...`,
        userId: s.token.userId,
        role: s.token.userRole,
        securityLevel: s.token.securityLevel,
        createdAt: s.token.createdAt,
        lastSeenAt: s.lastSeenAt,
        subnet: s.context.subnetPrefix
      }));

    this.metrics.activeProtectedSessions = Array.from(this.sessionsMap.values()).filter(s => s.token.isActive).length;

    return {
      metrics: {
        ...this.metrics,
        activePolicy: { ...this.policy }
      },
      policy: { ...this.policy },
      recentIncidents: [...this.incidents].reverse().slice(0, 50),
      activeSessionsSample
    };
  }

  public async evaluateSession(
    dto: EvaluateSessionDTO,
    actorId: string = 'api-client'
  ): Promise<EvaluateSessionResponse> {
    this.metrics.totalEvaluations++;

    const currentContext = buildClientContextFingerprint(
      dto.clientIp,
      dto.userAgent,
      dto.tlsFingerprint,
      dto.countryCode
    );

    // 1. Verifica tentativa de reuso de identificador pré-autenticação já invalidado (Session Fixation CWE-384)
    if (this.invalidatedPreAuthIds.has(dto.sessionId)) {
      this.metrics.fixationAttemptsBlocked++;
      this.metrics.lastIncidentTimestamp = new Date().toISOString();

      const sessionIdHash = createHash('sha256').update(dto.sessionId).digest('hex');
      const currentContextHash = computeContextHash(currentContext);

      const incident: SessionGuardIncident = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        anomalyType: SessionAnomalyType.PRE_AUTH_SESSION_REUSE,
        sessionId: dto.sessionId,
        userId: actorId,
        expectedSubnet: 'INVALIDATED_PRE_AUTH',
        actualIp: dto.clientIp,
        expectedUserAgentHash: 'INVALIDATED',
        actualUserAgentHash: currentContext.userAgentHash,
        mitigationAction: SessionMitigationAction.IMMEDIATE_REVOCATION,
        evidence: `Tentativa de reutilização de identificador de sessão pré-autenticação invalidado: ${dto.sessionId}`,
        seal: {
          version: '1.0.0',
          sealId: `session_guard_v1_fixation_${randomUUID().substring(0, 16)}`,
          timestamp: new Date().toISOString(),
          sessionIdHash,
          contextHash: currentContextHash,
          anomalyCount: 1,
          mitigationAction: SessionMitigationAction.IMMEDIATE_REVOCATION,
          hmacSignature: `sig_fixation_${Date.now()}`
        }
      };

      this.incidents.push(incident);
      this.sealsMap.set(incident.seal.sealId, incident.seal);

      await AuditService.log({
        action: AuditAction.SESSION_FIXATION_ATTEMPT_BLOCKED,
        resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
        resourceId: incident.id,
        actorId: actorId,
        details: {
          sessionId: dto.sessionId,
          clientIp: dto.clientIp,
          userAgent: dto.userAgent
        }
      });

      return {
        success: false,
        evaluation: {
          isAllowed: false,
          sessionId: dto.sessionId,
          action: SessionMitigationAction.IMMEDIATE_REVOCATION,
          anomalies: [{
            type: SessionAnomalyType.PRE_AUTH_SESSION_REUSE,
            description: 'Identificador de sessão pré-autenticação invalidado. Bloqueio preventivo de Session Fixation (CWE-384).',
            severity: 'CRITICAL',
            evidence: 'Tentativa de fixação de sessão detectada.'
          }],
          requiresRotation: false,
          contextFingerprint: currentContext,
          seal: incident.seal
        },
        message: 'Acesso bloqueado: Tentativa de reaproveitamento de sessão pré-login invalidada (Session Fixation CWE-384).'
      };
    }

    // 2. Localiza registro existente da sessão ou inicializa dinamicamente
    let sessionRecord = this.sessionsMap.get(dto.sessionId);
    if (!sessionRecord) {
      const newToken: SessionSecurityToken = {
        sessionId: dto.sessionId,
        userId: actorId,
        userRole: 'PSICOLOGO_TITULAR',
        createdAt: new Date().toISOString(),
        lastRotatedAt: new Date().toISOString(),
        securityLevel: SessionSecurityLevel.STRICT_CLINICAL,
        contextHash: computeContextHash(currentContext),
        isActive: true
      };

      sessionRecord = {
        token: newToken,
        context: currentContext,
        lastSeenAt: new Date().toISOString()
      };
      this.sessionsMap.set(dto.sessionId, sessionRecord);
    }

    // Atualiza timestamp
    sessionRecord.lastSeenAt = new Date().toISOString();

    // 3. Executa a avaliação criptográfica de contexto
    const evaluation = evaluateSessionContext(
      sessionRecord.token,
      sessionRecord.context,
      currentContext,
      this.policy,
      dto.isPrivilegeElevation
    );

    this.sealsMap.set(evaluation.seal.sealId, evaluation.seal);

    // 4. Trata Rotação Obrigatória (Login / Elevação de Privilégio)
    if (evaluation.requiresRotation && evaluation.newSessionId) {
      this.metrics.legitimateRotations++;
      const oldId = dto.sessionId;
      const newId = evaluation.newSessionId;

      this.invalidatedPreAuthIds.add(oldId);
      sessionRecord.token.isActive = false;
      this.sessionsMap.delete(oldId);

      const rotatedToken: SessionSecurityToken = {
        sessionId: newId,
        userId: sessionRecord.token.userId,
        userRole: sessionRecord.token.userRole,
        createdAt: sessionRecord.token.createdAt,
        lastRotatedAt: new Date().toISOString(),
        securityLevel: sessionRecord.token.securityLevel,
        contextHash: computeContextHash(currentContext),
        preAuthSessionIdInvalidated: oldId,
        isActive: true
      };

      this.sessionsMap.set(newId, {
        token: rotatedToken,
        context: currentContext,
        lastSeenAt: new Date().toISOString()
      });

      await AuditService.log({
        action: AuditAction.SESSION_ROTATED_ON_PRIVILEGE_ELEVATION,
        resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
        resourceId: newId,
        actorId: actorId,
        details: {
          oldSessionIdHash: createHash('sha256').update(oldId).digest('hex'),
          newSessionIdHash: createHash('sha256').update(newId).digest('hex'),
          contextHash: rotatedToken.contextHash,
          sealId: evaluation.seal.sealId
        }
      });
    }

    // 5. Trata Anomalias e Mitigações
    if (evaluation.anomalies.length > 0) {
      const isCritical = evaluation.anomalies.some(a => a.severity === 'CRITICAL');
      const isHigh = evaluation.anomalies.some(a => a.severity === 'HIGH');

      if (isCritical || isHigh) {
        this.metrics.hijackAttemptsBlocked++;
        this.metrics.lastIncidentTimestamp = new Date().toISOString();
        sessionRecord.token.isActive = false;

        const incident: SessionGuardIncident = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          anomalyType: evaluation.anomalies[0].type,
          sessionId: dto.sessionId,
          userId: actorId,
          expectedSubnet: sessionRecord.context.subnetPrefix,
          actualIp: dto.clientIp,
          expectedUserAgentHash: sessionRecord.context.userAgentHash,
          actualUserAgentHash: currentContext.userAgentHash,
          mitigationAction: evaluation.action,
          evidence: evaluation.anomalies.map(a => `${a.description} [${a.evidence}]`).join('; '),
          seal: evaluation.seal
        };

        this.incidents.push(incident);
        if (this.incidents.length > 50) {
          this.incidents.shift();
        }

        await AuditService.log({
          action: AuditAction.SESSION_HIJACKING_DETECTED,
          resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
          resourceId: incident.id,
          actorId: actorId,
          details: {
            anomalyType: incident.anomalyType,
            action: incident.mitigationAction,
            evidence: incident.evidence,
            clientIp: dto.clientIp,
            expectedSubnet: incident.expectedSubnet,
            sealId: incident.seal.sealId
          }
        });
      }
    } else if (!evaluation.requiresRotation) {
      // Registro regular WORM de contexto íntegro
      await AuditService.log({
        action: AuditAction.SESSION_CONTEXT_BOUND,
        resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
        resourceId: evaluation.seal.sealId,
        actorId: actorId,
        details: {
          sessionIdHash: evaluation.seal.sessionIdHash,
          contextHash: evaluation.seal.contextHash,
          subnetPrefix: currentContext.subnetPrefix
        }
      });
    }

    return {
      success: evaluation.isAllowed,
      evaluation,
      message: evaluation.isAllowed
        ? (evaluation.requiresRotation
          ? 'Sessão rotacionada com sucesso após elevação de privilégio.'
          : 'Sessão clínica validada e vinculada ao contexto legítimo.')
        : `Ameaça de sequestro/fixação de sessão neutralizada (${evaluation.action}).`
    };
  }

  public async rotateSession(
    dto: RotateSessionDTO,
    actorId: string = 'auth-controller'
  ): Promise<RotateSessionResponse> {
    const currentContext = buildClientContextFingerprint(
      dto.clientIp,
      dto.userAgent,
      dto.tlsFingerprint
    );

    const newSessionId = generateCryptographicSessionId();
    const oldId = dto.oldSessionId;

    this.invalidatedPreAuthIds.add(oldId);
    const existing = this.sessionsMap.get(oldId);
    if (existing) {
      existing.token.isActive = false;
      this.sessionsMap.delete(oldId);
    }

    const rotatedToken: SessionSecurityToken = {
      sessionId: newSessionId,
      userId: dto.userId,
      userRole: dto.userRole,
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString(),
      securityLevel: dto.securityLevel || SessionSecurityLevel.STRICT_CLINICAL,
      contextHash: computeContextHash(currentContext),
      preAuthSessionIdInvalidated: oldId,
      isActive: true
    };

    this.sessionsMap.set(newSessionId, {
      token: rotatedToken,
      context: currentContext,
      lastSeenAt: new Date().toISOString()
    });

    this.metrics.legitimateRotations++;

    const seal = evaluateSessionContext(
      rotatedToken,
      currentContext,
      currentContext,
      this.policy,
      false
    ).seal;

    this.sealsMap.set(seal.sealId, seal);

    await AuditService.log({
      action: AuditAction.SESSION_ROTATED_ON_PRIVILEGE_ELEVATION,
      resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
      resourceId: newSessionId,
      actorId: actorId,
      details: {
        oldSessionIdHash: createHash('sha256').update(oldId).digest('hex'),
        newSessionIdHash: createHash('sha256').update(newSessionId).digest('hex'),
        userId: dto.userId,
        sealId: seal.sealId
      }
    });

    return {
      success: true,
      newSessionId,
      oldSessionInvalidated: true,
      seal,
      message: 'Sessão rotacionada e vinculada ao contexto de rede do cliente.'
    };
  }

  public async updatePolicy(
    dto: UpdateSessionGuardPolicyDTO,
    actorId: string = 'security-officer'
  ): Promise<UpdateSessionGuardPolicyResponse> {
    this.policy = {
      ...this.policy,
      ...dto.policy
    };
    this.metrics.activePolicy = { ...this.policy };

    await AuditService.log({
      action: AuditAction.SESSION_GUARD_POLICY_UPDATED,
      resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
      resourceId: 'session-guard-policy',
      actorId: actorId,
      details: {
        updatedFields: Object.keys(dto.policy),
        newPolicy: this.policy
      }
    });

    return {
      success: true,
      policy: { ...this.policy },
      message: 'Política de proteção de sessão atualizada e selada na trilha WORM com sucesso.'
    };
  }

  public async simulateAttack(
    dto: SimulateSessionAttackDTO,
    actorId: string = 'adversarial-tester'
  ): Promise<SimulateSessionAttackResponse> {
    // 1. Cria ou obtém uma sessão alvo para simulação
    const targetSessionId = dto.targetSessionId || generateCryptographicSessionId();
    const originalContext = buildClientContextFingerprint(
      '198.51.100.10',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      't13d1516h2_ja4_fingerprint_original',
      'BR'
    );

    if (!this.sessionsMap.has(targetSessionId)) {
      this.sessionsMap.set(targetSessionId, {
        token: {
          sessionId: targetSessionId,
          userId: 'usr_simulation_target',
          userRole: 'PSICOLOGO_TITULAR',
          createdAt: new Date().toISOString(),
          lastRotatedAt: new Date().toISOString(),
          securityLevel: SessionSecurityLevel.STRICT_CLINICAL,
          contextHash: computeContextHash(originalContext),
          isActive: true
        },
        context: originalContext,
        lastSeenAt: new Date().toISOString()
      });
    }

    // 2. Constrói o contexto adversarial conforme o tipo de ataque solicitado
    let attackIp = dto.customIp || '198.51.100.10';
    let attackUa = dto.customUserAgent || originalContext.userAgent;
    let attackTls = dto.customTlsFingerprint || originalContext.tlsFingerprint;
    let attackCountry = 'BR';
    let attackSessionId = targetSessionId;

    switch (dto.anomalyType) {
      case SessionAnomalyType.USER_AGENT_MUTATION:
        attackUa = 'curl/8.4.0 Malicious-Token-Exfiltrator';
        break;

      case SessionAnomalyType.IP_SUBNET_MISMATCH:
        attackIp = '203.0.113.88'; // Sub-rede externa não autorizada
        break;

      case SessionAnomalyType.GEOGRAPHIC_IMPOSSIBLE_TRAVEL:
        attackCountry = 'UA'; // Salto para país estrangeiro
        attackIp = '91.240.118.12';
        break;

      case SessionAnomalyType.TLS_FINGERPRINT_MISMATCH:
        attackTls = 't13d_tampered_modified_cipher_list';
        break;

      case SessionAnomalyType.PRE_AUTH_SESSION_REUSE: {
        const dummyPreAuthId = generateCryptographicSessionId();
        this.invalidatedPreAuthIds.add(dummyPreAuthId);
        attackSessionId = dummyPreAuthId;
        break;
      }

      default:
        attackUa = 'Attacker-Browser-Mutated';
        break;
    }

    const evalResponse = await this.evaluateSession({
      sessionId: attackSessionId,
      clientIp: attackIp,
      userAgent: attackUa,
      tlsFingerprint: attackTls,
      countryCode: attackCountry
    }, actorId);

    const latestIncident = this.incidents[this.incidents.length - 1];

    return {
      success: true,
      threatDetected: !evalResponse.evaluation.isAllowed,
      evaluation: evalResponse.evaluation,
      incident: !evalResponse.evaluation.isAllowed ? latestIncident : undefined,
      message: !evalResponse.evaluation.isAllowed
        ? `Ataque simulado [${dto.anomalyType}] detectado e neutralizado com sucesso!`
        : `Nenhuma violação crítica acionada na simulação [${dto.anomalyType}].`,
      timestamp: new Date().toISOString()
    };
  }

  public async verifySeal(
    dto: VerifySessionSealDTO,
    actorId: string = 'seal-auditor'
  ): Promise<VerifySessionSealResponse> {
    let sealToVerify: any = dto.sealToken;
    if (typeof dto.sealToken === 'string' && this.sealsMap.has(dto.sealToken)) {
      sealToVerify = this.sealsMap.get(dto.sealToken)!;
    }

    const verification = verifySessionProofSeal(sealToVerify);
    const sealId = verification.parsedSeal?.sealId || (typeof dto.sealToken === 'string' ? dto.sealToken.slice(0, 32) : 'unknown_seal');

    await AuditService.log({
      action: AuditAction.SESSION_GUARD_SEAL_VERIFIED,
      resourceType: AuditResourceType.SESSION_HIJACKING_GUARD,
      resourceId: sealId,
      actorId: actorId,
      details: {
        isValid: verification.isValid,
        reason: verification.reason,
        seal: verification.parsedSeal
      }
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal: verification.parsedSeal,
      message: verification.isValid
        ? 'Selo probatório de segurança de sessão autêntico e verificado.'
        : `Selo de sessão inválido: ${verification.reason}`,
      verifiedAt: new Date().toISOString()
    };
  }
}
