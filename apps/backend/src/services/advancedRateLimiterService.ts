import {
  AuditAction,
  AuditResourceType,
  RateLimitingAlgorithm,
  RateLimitTier,
  RateLimitDecision,
  type RateLimitRuleConfig,
  type RateLimitEvaluationResult,
  type RateLimitProofSeal,
  type AdvancedRateLimitMetrics,
  type AdvancedRateLimitOverview,
  type TokenBucketState,
  type SlidingWindowLogEntry,
  type EvaluateRateLimitDTO,
  type ConfigureRateLimitRuleDTO,
  type ResetClientBucketDTO,
  type VerifyRateLimitSealDTO
} from '@terapiainfoco/shared';
import {
  evaluateAdvancedRateLimit,
  createRateLimitProofSeal,
  verifyRateLimitProofSeal
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class AdvancedRateLimiterService {
  private static instance: AdvancedRateLimiterService;

  private clientBuckets: Map<string, TokenBucketState> = new Map();
  private clientWindowLogs: Map<string, SlidingWindowLogEntry[]> = new Map();
  private clientViolations: Map<string, number> = new Map();
  private clientQuarantines: Map<string, { clientId: string; quarantinedUntil: string; reason: string; totalViolations: number }> = new Map();
  private proofSeals: Map<string, RateLimitProofSeal> = new Map();

  private metrics: AdvancedRateLimitMetrics = {
    totalEvaluatedRequests: 48250,
    totalThrottledRequests: 184,
    activeQuarantinedClients: 3,
    tokenBucketConsumptions: 48066,
    slidingWindowRejections: 112,
    activeRulesCount: 6
  };

  private rules: Map<string, RateLimitRuleConfig> = new Map([
    [
      'RULE-AUTH-LOGIN',
      {
        id: 'RULE-AUTH-LOGIN',
        name: 'Autenticação & Prevenção de Credential Stuffing',
        pathPattern: '/api/auth/login',
        tier: RateLimitTier.PUBLIC_ANONYMOUS,
        algorithm: RateLimitingAlgorithm.HYBRID_TOKEN_BUCKET_SLIDING_WINDOW,
        bucketCapacity: 5,
        refillRatePerSecond: 1,
        windowSizeSeconds: 60,
        maxRequestsPerWindow: 10,
        burstAllowanceMultiplier: 1.5,
        penaltyQuarantineMinutes: 15,
        description: 'Bloqueio estrito de força bruta em autenticação com token bucket fracionário e janela deslizante'
      }
    ],
    [
      'RULE-AUTH-MFA',
      {
        id: 'RULE-AUTH-MFA',
        name: 'Desafio 2FA / TOTP e Passkeys Biométricas',
        pathPattern: '/api/auth/verify-2fa',
        tier: RateLimitTier.AUTHENTICATED_CLINICAL,
        algorithm: RateLimitingAlgorithm.HYBRID_TOKEN_BUCKET_SLIDING_WINDOW,
        bucketCapacity: 4,
        refillRatePerSecond: 0.5,
        windowSizeSeconds: 60,
        maxRequestsPerWindow: 6,
        burstAllowanceMultiplier: 1.2,
        penaltyQuarantineMinutes: 30,
        description: 'Proteção contra exaustão de códigos de segundo fator'
      }
    ],
    [
      'RULE-CLINICAL-EXPORT',
      {
        id: 'RULE-CLINICAL-EXPORT',
        name: 'Exportação Criptografada de Prontuário (LGPD Art. 18)',
        pathPattern: '/api/data-portability/export',
        tier: RateLimitTier.CRITICAL_EHR_EXPORT,
        algorithm: RateLimitingAlgorithm.HYBRID_TOKEN_BUCKET_SLIDING_WINDOW,
        bucketCapacity: 2,
        refillRatePerSecond: 0.05,
        windowSizeSeconds: 300,
        maxRequestsPerWindow: 3,
        burstAllowanceMultiplier: 1.0,
        penaltyQuarantineMinutes: 60,
        description: 'Vazão controlada para exportação massiva de prontuários com envelope encryption'
      }
    ],
    [
      'RULE-ICP-SIGN',
      {
        id: 'RULE-ICP-SIGN',
        name: 'Assinatura Notarial & Certificação ICP-Brasil (CFP nº 001/2009)',
        pathPattern: '/api/clinical-records/sign',
        tier: RateLimitTier.CRITICAL_EHR_EXPORT,
        algorithm: RateLimitingAlgorithm.HYBRID_TOKEN_BUCKET_SLIDING_WINDOW,
        bucketCapacity: 10,
        refillRatePerSecond: 2,
        windowSizeSeconds: 60,
        maxRequestsPerWindow: 30,
        burstAllowanceMultiplier: 2.0,
        penaltyQuarantineMinutes: 10,
        description: 'Vazão adaptada para evolução e assinatura em lote de notas clínicas pelo terapeuta titular'
      }
    ],
    [
      'RULE-WEBRTC-SIGNAL',
      {
        id: 'RULE-WEBRTC-SIGNAL',
        name: 'Sinalização WebRTC & Telemedicina Criptografada',
        pathPattern: '/api/teleconsultation/webrtc',
        tier: RateLimitTier.AUTHENTICATED_CLINICAL,
        algorithm: RateLimitingAlgorithm.TOKEN_BUCKET,
        bucketCapacity: 60,
        refillRatePerSecond: 10,
        windowSizeSeconds: 60,
        maxRequestsPerWindow: 120,
        burstAllowanceMultiplier: 2.5,
        penaltyQuarantineMinutes: 5,
        description: 'Alta capacidade de rajadas para troca de ICE candidates e negociação SDP'
      }
    ],
    [
      'RULE-PUBLIC-LANDING',
      {
        id: 'RULE-PUBLIC-LANDING',
        name: 'Agendamento Online Público & Telemetria Aberta',
        pathPattern: '/api/appointments/schedule-public',
        tier: RateLimitTier.PUBLIC_ANONYMOUS,
        algorithm: RateLimitingAlgorithm.SLIDING_WINDOW_LOG,
        bucketCapacity: 10,
        refillRatePerSecond: 1,
        windowSizeSeconds: 60,
        maxRequestsPerWindow: 20,
        burstAllowanceMultiplier: 1.5,
        penaltyQuarantineMinutes: 15,
        description: 'Prevenção de spam e reserva automatizada de horários na landing page'
      }
    ]
  ]);

  private constructor() {
    this.seedInitialQuarantines();
  }

  public static getInstance(): AdvancedRateLimiterService {
    if (!AdvancedRateLimiterService.instance) {
      AdvancedRateLimiterService.instance = new AdvancedRateLimiterService();
    }
    return AdvancedRateLimiterService.instance;
  }

  private seedInitialQuarantines(): void {
    const quarantinedSeeds = [
      {
        clientId: '185.220.101.42',
        reason: 'Ataque de força bruta distribuído em /api/auth/login com estouro de 5 bursts consecutivos',
        quarantinedUntil: new Date(Date.now() + 1800000).toISOString(),
        totalViolations: 8
      },
      {
        clientId: '194.26.29.115',
        reason: 'Tentativa massiva de scraping em endpoints de agendamento público',
        quarantinedUntil: new Date(Date.now() + 2700000).toISOString(),
        totalViolations: 12
      },
      {
        clientId: '198.51.100.230',
        reason: 'Exaustão forçada de requisições em /api/data-portability/export',
        quarantinedUntil: new Date(Date.now() + 900000).toISOString(),
        totalViolations: 6
      }
    ];

    quarantinedSeeds.forEach(seed => {
      this.clientQuarantines.set(seed.clientId, seed);
      this.clientViolations.set(seed.clientId, seed.totalViolations);
    });
  }

  public getOverview(): AdvancedRateLimitOverview {
    const quarantinedClients = Array.from(this.clientQuarantines.values());
    this.metrics.activeQuarantinedClients = quarantinedClients.length;
    this.metrics.activeRulesCount = this.rules.size;

    const recentAudits = quarantinedClients.map(q => ({
      id: `AUD-RL-${q.clientId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`,
      action: 'RATE_LIMIT_QUARANTINE_APPLIED',
      timestamp: new Date().toISOString(),
      details: `${q.reason} [Cliente: ${q.clientId}] [Até: ${new Date(q.quarantinedUntil).toLocaleTimeString('pt-BR')}]`
    }));

    return {
      metrics: { ...this.metrics },
      rules: Array.from(this.rules.values()),
      quarantinedClients,
      recentAudits
    };
  }

  public findMatchingRule(path: string, tier?: RateLimitTier): RateLimitRuleConfig {
    // 1. Tenta correspondência exata ou por prefixo de path
    for (const rule of this.rules.values()) {
      if (path.startsWith(rule.pathPattern)) {
        return rule;
      }
    }

    // 2. Tenta por Tier
    if (tier) {
      for (const rule of this.rules.values()) {
        if (rule.tier === tier) return rule;
      }
    }

    // 3. Fallback: regra geral de login/autenticação
    return this.rules.get('RULE-AUTH-LOGIN')!;
  }

  public evaluate(
    dto: EvaluateRateLimitDTO,
    reqMeta?: { ip: string; userAgent: string; actorId: string }
  ): {
    success: boolean;
    evaluation: RateLimitEvaluationResult;
    proofSeal?: RateLimitProofSeal;
    message: string;
  } {
    const rule = this.findMatchingRule(dto.path, dto.tier);
    const key = `${dto.clientId}:${rule.id}`;

    // Obtém ou inicializa o Token Bucket para o cliente
    let bucket = this.clientBuckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: rule.bucketCapacity,
        capacity: rule.bucketCapacity,
        refillRatePerSecond: rule.refillRatePerSecond,
        lastRefillTimestampMs: Date.now()
      };
    }

    // Obtém ou inicializa o histórico de Sliding Window
    const windowLog = this.clientWindowLogs.get(key) || [];

    // Checa quarentena existente
    const quarantine = this.clientQuarantines.get(dto.clientId);
    const isQuarantined = !!(quarantine && new Date(quarantine.quarantinedUntil).getTime() > Date.now());

    this.metrics.totalEvaluatedRequests++;

    const evalOutput = evaluateAdvancedRateLimit({
      clientId: dto.clientId,
      rule,
      bucket,
      windowLog,
      tokensToConsume: dto.tokensToConsume || 1,
      overrideAlgorithm: dto.overrideAlgorithm,
      isQuarantined,
      quarantinedUntil: quarantine?.quarantinedUntil,
      nowMs: Date.now()
    });

    // Atualiza estado do cliente
    this.clientBuckets.set(key, evalOutput.updatedBucket);
    this.clientWindowLogs.set(key, evalOutput.updatedWindowLog);

    let seal: RateLimitProofSeal | undefined;

    if (evalOutput.result.isAllowed) {
      this.metrics.tokenBucketConsumptions++;
      // Zera violações consecutivas em caso de sucesso contínuo
      this.clientViolations.set(dto.clientId, 0);

      seal = createRateLimitProofSeal(evalOutput.result);
      this.proofSeals.set(seal.token, seal);
    } else {
      this.metrics.totalThrottledRequests++;
      if (evalOutput.result.reason.includes('Sliding Window') || evalOutput.result.reason.includes('Volume agregado')) {
        this.metrics.slidingWindowRejections++;
      }

      // Incrementa violações consecutivas do cliente
      const currentViolations = (this.clientViolations.get(dto.clientId) || 0) + 1;
      this.clientViolations.set(dto.clientId, currentViolations);

      // Se exceder 5 violações consecutivas, aplica quarentena automática
      if (currentViolations >= 5 && !isQuarantined) {
        const quarantineDurationMs = rule.penaltyQuarantineMinutes * 60 * 1000;
        const quarantinedUntil = new Date(Date.now() + quarantineDurationMs).toISOString();
        const reason = `Quarentena automática aplicada após ${currentViolations} violações consecutivas de rate limit na regra ${rule.name}`;

        this.clientQuarantines.set(dto.clientId, {
          clientId: dto.clientId,
          reason,
          quarantinedUntil,
          totalViolations: currentViolations
        });

        evalOutput.result.decision = RateLimitDecision.QUARANTINED;
        evalOutput.result.quarantinedUntil = quarantinedUntil;
        evalOutput.result.retryAfterSeconds = rule.penaltyQuarantineMinutes * 60;
        evalOutput.result.reason = reason;

        AuditService.log({
          action: AuditAction.RATE_LIMIT_QUARANTINE_APPLIED,
          resourceType: AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE,
          resourceId: dto.clientId,
          actorId: reqMeta?.actorId ?? 'system',
          ipAddress: reqMeta?.ip || dto.clientId,
          userAgent: reqMeta?.userAgent || 'Rate-Limiter',
          details: { message: `Cliente ${dto.clientId} isolado em quarentena por ${rule.penaltyQuarantineMinutes} min: ${reason}` }
        });
      } else {
        AuditService.log({
          action: evalOutput.result.reason.includes('Token Bucket')
            ? AuditAction.RATE_LIMIT_BURST_BLOCKED
            : AuditAction.RATE_LIMIT_SLIDING_WINDOW_EXCEEDED,
          resourceType: AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE,
          resourceId: dto.clientId,
          actorId: reqMeta?.actorId ?? 'system',
          ipAddress: reqMeta?.ip || dto.clientId,
          userAgent: reqMeta?.userAgent || 'Rate-Limiter',
          details: { message: `Requisição limitada por taxa em ${rule.pathPattern}: [Decisão: ${evalOutput.result.decision}] [Retry-After: ${evalOutput.result.retryAfterSeconds}s]` }
        });
      }

      seal = createRateLimitProofSeal(evalOutput.result);
      this.proofSeals.set(seal.token, seal);
    }

    return {
      success: evalOutput.result.isAllowed,
      evaluation: evalOutput.result,
      proofSeal: seal,
      message: evalOutput.result.isAllowed
        ? 'Requisição autorizada pelo motor de Rate Limiting'
        : evalOutput.result.reason
    };
  }

  public configureRule(dto: ConfigureRateLimitRuleDTO): {
    success: boolean;
    rule: RateLimitRuleConfig;
    message: string;
  } {
    const existing = this.rules.get(dto.ruleId);
    if (!existing) {
      throw new Error(`Regra de Rate Limiting não encontrada: ${dto.ruleId}`);
    }

    const updated: RateLimitRuleConfig = {
      ...existing,
      bucketCapacity: dto.bucketCapacity ?? existing.bucketCapacity,
      refillRatePerSecond: dto.refillRatePerSecond ?? existing.refillRatePerSecond,
      windowSizeSeconds: dto.windowSizeSeconds ?? existing.windowSizeSeconds,
      maxRequestsPerWindow: dto.maxRequestsPerWindow ?? existing.maxRequestsPerWindow,
      burstAllowanceMultiplier: dto.burstAllowanceMultiplier ?? existing.burstAllowanceMultiplier,
      penaltyQuarantineMinutes: dto.penaltyQuarantineMinutes ?? existing.penaltyQuarantineMinutes
    };

    this.rules.set(updated.id, updated);

    AuditService.log({
      actorId: 'system',
      action: AuditAction.RATE_LIMIT_TIER_CONFIGURED,
      resourceType: AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE,
      resourceId: updated.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Rate-Limit-Configurator',
      details: { message: `Regra ${updated.id} reconfigurada: [Bucket: ${updated.bucketCapacity}] [Refill: ${updated.refillRatePerSecond}/s] [Window: ${updated.windowSizeSeconds}s/Max: ${updated.maxRequestsPerWindow}]` }
    });

    return {
      success: true,
      rule: updated,
      message: `Regra '${updated.name}' atualizada com sucesso.`
    };
  }

  public resetClient(dto: ResetClientBucketDTO): { success: boolean; message: string } {
    this.clientQuarantines.delete(dto.clientId);
    this.clientViolations.delete(dto.clientId);

    // Remove buckets e logs deste cliente
    for (const key of this.clientBuckets.keys()) {
      if (key.startsWith(`${dto.clientId}:`)) {
        this.clientBuckets.delete(key);
      }
    }
    for (const key of this.clientWindowLogs.keys()) {
      if (key.startsWith(`${dto.clientId}:`)) {
        this.clientWindowLogs.delete(key);
      }
    }

    AuditService.log({
      actorId: 'system',
      action: AuditAction.RATE_LIMIT_QUARANTINE_APPLIED,
      resourceType: AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE,
      resourceId: dto.clientId,
      ipAddress: '127.0.0.1',
      userAgent: 'Rate-Limit-Admin',
      details: { message: `Quarentena e limites do cliente ${dto.clientId} resetados manualmente. Motivo: ${dto.reason || 'Liberação administrativa de falso positivo'}` }
    });

    return {
      success: true,
      message: `Cliente ${dto.clientId} liberado da quarentena e com contadores de tokens resetados.`
    };
  }

  public verifyProofSeal(dto: VerifyRateLimitSealDTO): {
    success: boolean;
    isValid: boolean;
    seal?: RateLimitProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const seal = this.proofSeals.get(dto.proofSealToken);
    const verifiedAt = new Date().toISOString();

    if (!seal) {
      return {
        success: false,
        isValid: false,
        message: 'Selo probatório de rate limiting não encontrado no registro local',
        verifiedAt
      };
    }

    const verification = verifyRateLimitProofSeal(seal);

    AuditService.log({
      actorId: 'system',
      action: AuditAction.RATE_LIMIT_PROOF_SEAL_VERIFIED,
      resourceType: AuditResourceType.ADVANCED_RATE_LIMIT_ENGINE,
      resourceId: seal.token,
      ipAddress: '127.0.0.1',
      userAgent: 'Rate-Limit-Auditor',
      details: { message: `Validação pericial de selo probatório de rate limiting: [Válido: ${verification.isValid}] [Cliente: ${seal.clientId}]` }
    });

    return {
      success: true,
      isValid: verification.isValid,
      seal,
      message: verification.isValid
        ? 'Selo probatório de rate limiting autêntico, íntegro e assinado com HMAC-SHA256 WORM'
        : `Falha na verificação do selo probatório: ${verification.reason}`,
      verifiedAt
    };
  }

  public getRules(): RateLimitRuleConfig[] {
    return Array.from(this.rules.values());
  }
}
