/**
 * Motor de Rate Limiting Avançado com Algoritmo Híbrido (Token Bucket + Sliding Window Log)
 * Proteção Anti-DDoS e Abuso de Recursos Clínicos Sensíveis (OWASP Top 10 API Security API4:2023 & RFC-001 §4.4, §5.2)
 *
 * Características:
 * 1. Token Bucket com recarga fracionária temporal contínua para absorção controlada de bursts.
 * 2. Sliding Window Log com retenção precisa de timestamps para controle estrito de volumetria agregada.
 * 3. Modo Híbrido: Autorização condicional dupla (Burst + Volume Médio) com cálculo exato de Retry-After.
 * 4. Detecção de Abuso Repetido com Quarentena Automática e Penalização Temporal.
 * 5. Emissão e Verificação Criptográfica de Selos Probatórios WORM HMAC-SHA256.
 */

import { createHmac, createHash } from 'node:crypto';
import {
  RateLimitingAlgorithm,
  RateLimitTier,
  RateLimitDecision
} from '@terapiainfoco/shared';
import type {
  TokenBucketState,
  SlidingWindowLogEntry,
  RateLimitRuleConfig,
  RateLimitEvaluationResult,
  RateLimitProofSeal
} from '@terapiainfoco/shared';

const DEFAULT_RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'terapiainfoco-rate-limiter-worm-secret-key-2026';

/**
 * Atualiza o estado de um Token Bucket aplicando a recarga fracionária temporal contínua
 */
export function refillTokenBucket(
  bucket: TokenBucketState,
  nowMs: number = Date.now()
): TokenBucketState {
  const elapsedMs = Math.max(0, nowMs - bucket.lastRefillTimestampMs);
  const elapsedSeconds = elapsedMs / 1000;
  const refilledTokens = elapsedSeconds * bucket.refillRatePerSecond;
  const newTokens = Math.min(bucket.capacity, bucket.tokens + refilledTokens);

  return {
    tokens: newTokens,
    capacity: bucket.capacity,
    refillRatePerSecond: bucket.refillRatePerSecond,
    lastRefillTimestampMs: nowMs
  };
}

/**
 * Avalia o consumo de tokens em um Token Bucket
 */
export function consumeTokenBucket(
  bucket: TokenBucketState,
  tokensToConsume: number = 1,
  nowMs: number = Date.now()
): { allowed: boolean; updatedBucket: TokenBucketState; retryAfterSeconds: number } {
  const refilled = refillTokenBucket(bucket, nowMs);

  if (refilled.tokens >= tokensToConsume) {
    return {
      allowed: true,
      updatedBucket: {
        ...refilled,
        tokens: refilled.tokens - tokensToConsume
      },
      retryAfterSeconds: 0
    };
  }

  const tokensNeeded = tokensToConsume - refilled.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / refilled.refillRatePerSecond));

  return {
    allowed: false,
    updatedBucket: refilled,
    retryAfterSeconds
  };
}

/**
 * Expira entradas fora da janela deslizante e avalia a permissão do Sliding Window Log
 */
export function evaluateSlidingWindow(
  log: SlidingWindowLogEntry[],
  windowSizeSeconds: number,
  maxRequestsPerWindow: number,
  cost: number = 1,
  nowMs: number = Date.now()
): { allowed: boolean; updatedLog: SlidingWindowLogEntry[]; currentCount: number; retryAfterSeconds: number } {
  const windowStartMs = nowMs - windowSizeSeconds * 1000;
  // Filtra apenas registros dentro da janela deslizante
  const validLog = log.filter(entry => entry.timestampMs >= windowStartMs);
  const currentCount = validLog.reduce((acc, curr) => acc + curr.weight, 0);

  if (currentCount + cost <= maxRequestsPerWindow) {
    const updatedLog = [...validLog, { timestampMs: nowMs, weight: cost }];
    return {
      allowed: true,
      updatedLog,
      currentCount: currentCount + cost,
      retryAfterSeconds: 0
    };
  }

  // Calcula quanto tempo levará para o registro mais antigo da janela expirar
  let retryAfterSeconds = 1;
  if (validLog.length > 0) {
    const oldestMs = validLog[0].timestampMs;
    const expiresAtMs = oldestMs + windowSizeSeconds * 1000;
    retryAfterSeconds = Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000));
  }

  return {
    allowed: false,
    updatedLog: validLog,
    currentCount,
    retryAfterSeconds
  };
}

/**
 * Avalia requisição com base na regra e algoritmos configurados (Híbrido, Token Bucket ou Sliding Window)
 */
export function evaluateAdvancedRateLimit(options: {
  clientId: string;
  rule: RateLimitRuleConfig;
  bucket: TokenBucketState;
  windowLog: SlidingWindowLogEntry[];
  tokensToConsume?: number;
  overrideAlgorithm?: RateLimitingAlgorithm;
  isQuarantined?: boolean;
  quarantinedUntil?: string;
  nowMs?: number;
}): {
  result: RateLimitEvaluationResult;
  updatedBucket: TokenBucketState;
  updatedWindowLog: SlidingWindowLogEntry[];
} {
  const {
    clientId,
    rule,
    tokensToConsume = 1,
    overrideAlgorithm,
    isQuarantined = false,
    quarantinedUntil,
    nowMs = Date.now()
  } = options;

  const timestamp = new Date(nowMs).toISOString();
  const algorithm = overrideAlgorithm || rule.algorithm;

  // 1. Checagem de Quarentena Ativa
  if (isQuarantined && quarantinedUntil && new Date(quarantinedUntil).getTime() > nowMs) {
    const remainingQuarantineMs = new Date(quarantinedUntil).getTime() - nowMs;
    const retryAfter = Math.max(1, Math.ceil(remainingQuarantineMs / 1000));

    return {
      result: {
        decision: RateLimitDecision.QUARANTINED,
        isAllowed: false,
        clientId,
        ruleId: rule.id,
        tier: rule.tier,
        remainingTokens: 0,
        tokenBucketCapacity: rule.bucketCapacity,
        currentWindowCount: options.windowLog.length,
        maxWindowAllowance: rule.maxRequestsPerWindow,
        retryAfterSeconds: retryAfter,
        quarantinedUntil,
        reason: `Cliente em quarentena de segurança por abuso sistemático de requisições até ${new Date(quarantinedUntil).toLocaleString('pt-BR')}`,
        timestamp
      },
      updatedBucket: options.bucket,
      updatedWindowLog: options.windowLog
    };
  }

  // 2. Avaliação de Acordo com o Algoritmo
  if (algorithm === RateLimitingAlgorithm.TOKEN_BUCKET) {
    const tbRes = consumeTokenBucket(options.bucket, tokensToConsume, nowMs);
    const decision = tbRes.allowed ? RateLimitDecision.ALLOWED : RateLimitDecision.THROTTLED;

    return {
      result: {
        decision,
        isAllowed: tbRes.allowed,
        clientId,
        ruleId: rule.id,
        tier: rule.tier,
        remainingTokens: Math.floor(tbRes.updatedBucket.tokens),
        tokenBucketCapacity: rule.bucketCapacity,
        currentWindowCount: 0,
        maxWindowAllowance: rule.maxRequestsPerWindow,
        retryAfterSeconds: tbRes.retryAfterSeconds,
        reason: tbRes.allowed
          ? 'Requisição autorizada pelo Token Bucket'
          : `Capacidade de burst do Token Bucket esgotada. Tente novamente em ${tbRes.retryAfterSeconds}s`,
        timestamp
      },
      updatedBucket: tbRes.updatedBucket,
      updatedWindowLog: options.windowLog
    };
  }

  if (algorithm === RateLimitingAlgorithm.SLIDING_WINDOW_LOG) {
    const swRes = evaluateSlidingWindow(
      options.windowLog,
      rule.windowSizeSeconds,
      rule.maxRequestsPerWindow,
      tokensToConsume,
      nowMs
    );
    const decision = swRes.allowed ? RateLimitDecision.ALLOWED : RateLimitDecision.THROTTLED;

    return {
      result: {
        decision,
        isAllowed: swRes.allowed,
        clientId,
        ruleId: rule.id,
        tier: rule.tier,
        remainingTokens: Math.max(0, rule.maxRequestsPerWindow - swRes.currentCount),
        tokenBucketCapacity: rule.bucketCapacity,
        currentWindowCount: swRes.currentCount,
        maxWindowAllowance: rule.maxRequestsPerWindow,
        retryAfterSeconds: swRes.retryAfterSeconds,
        reason: swRes.allowed
          ? 'Requisição autorizada pelo Sliding Window Log'
          : `Limite de volume na janela de ${rule.windowSizeSeconds}s atingido (${swRes.currentCount}/${rule.maxRequestsPerWindow}). Aguarde expiração do registro mais antigo`,
        timestamp
      },
      updatedBucket: options.bucket,
      updatedWindowLog: swRes.updatedLog
    };
  }

  // 3. Algoritmo Padrão: HYBRID_TOKEN_BUCKET_SLIDING_WINDOW
  // Testa Token Bucket primeiro (absorção de burst imediata)
  const tbRes = consumeTokenBucket(options.bucket, tokensToConsume, nowMs);

  // Se o Token Bucket falhar, já throttles sem adicionar ao sliding window
  if (!tbRes.allowed) {
    return {
      result: {
        decision: RateLimitDecision.THROTTLED,
        isAllowed: false,
        clientId,
        ruleId: rule.id,
        tier: rule.tier,
        remainingTokens: Math.floor(tbRes.updatedBucket.tokens),
        tokenBucketCapacity: rule.bucketCapacity,
        currentWindowCount: options.windowLog.length,
        maxWindowAllowance: rule.maxRequestsPerWindow,
        retryAfterSeconds: tbRes.retryAfterSeconds,
        reason: `Rajada (burst) não autorizada: Token Bucket esgotado (${Math.floor(tbRes.updatedBucket.tokens)}/${rule.bucketCapacity}). Taxa de recarga: ${rule.refillRatePerSecond} tokens/s`,
        timestamp
      },
      updatedBucket: tbRes.updatedBucket,
      updatedWindowLog: options.windowLog
    };
  }

  // Testa Sliding Window Log para volume agregado na janela
  const swRes = evaluateSlidingWindow(
    options.windowLog,
    rule.windowSizeSeconds,
    rule.maxRequestsPerWindow,
    tokensToConsume,
    nowMs
  );

  if (!swRes.allowed) {
    // Reverte os tokens consumidos do bucket já que o sliding window rejeitou
    const rolledBackBucket = {
      ...tbRes.updatedBucket,
      tokens: Math.min(rule.bucketCapacity, tbRes.updatedBucket.tokens + tokensToConsume)
    };

    return {
      result: {
        decision: RateLimitDecision.THROTTLED,
        isAllowed: false,
        clientId,
        ruleId: rule.id,
        tier: rule.tier,
        remainingTokens: Math.floor(rolledBackBucket.tokens),
        tokenBucketCapacity: rule.bucketCapacity,
        currentWindowCount: swRes.currentCount,
        maxWindowAllowance: rule.maxRequestsPerWindow,
        retryAfterSeconds: swRes.retryAfterSeconds,
        reason: `Volume agregado de requisições excedido na janela deslizante de ${rule.windowSizeSeconds}s (${swRes.currentCount}/${rule.maxRequestsPerWindow}). Tente novamente em ${swRes.retryAfterSeconds}s`,
        timestamp
      },
      updatedBucket: rolledBackBucket,
      updatedWindowLog: swRes.updatedLog
    };
  }

  // Ambos os algoritmos autorizaram com sucesso
  return {
    result: {
      decision: RateLimitDecision.ALLOWED,
      isAllowed: true,
      clientId,
      ruleId: rule.id,
      tier: rule.tier,
      remainingTokens: Math.floor(tbRes.updatedBucket.tokens),
      tokenBucketCapacity: rule.bucketCapacity,
      currentWindowCount: swRes.currentCount,
      maxWindowAllowance: rule.maxRequestsPerWindow,
      retryAfterSeconds: 0,
      reason: 'Requisição aprovada pelo algoritmo híbrido (Token Bucket + Sliding Window)',
      timestamp
    },
    updatedBucket: tbRes.updatedBucket,
    updatedWindowLog: swRes.updatedLog
  };
}

/**
 * Calcula o digest canônico SHA-256 de uma avaliação de rate limiting
 */
export function calculateRateLimitCanonicalDigest(evaluation: RateLimitEvaluationResult): string {
  const payload = {
    clientId: evaluation.clientId,
    ruleId: evaluation.ruleId,
    tier: evaluation.tier,
    decision: evaluation.decision,
    remainingTokens: evaluation.remainingTokens,
    currentWindowCount: evaluation.currentWindowCount,
    retryAfterSeconds: evaluation.retryAfterSeconds,
    timestamp: evaluation.timestamp
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Cria o selo probatório HMAC-SHA256 WORM da avaliação de rate limiting
 */
export function createRateLimitProofSeal(
  evaluation: RateLimitEvaluationResult,
  secretKey: string = DEFAULT_RATE_LIMIT_SECRET
): RateLimitProofSeal {
  const canonicalDigest = calculateRateLimitCanonicalDigest(evaluation);
  const hmac = createHmac('sha256', secretKey);
  hmac.update(`${canonicalDigest}:${evaluation.timestamp}:${evaluation.decision}`);
  const hmacSignature = hmac.digest('hex');

  const token = `RL-SEAL-v1-${canonicalDigest.substring(0, 16)}-${hmacSignature.substring(0, 16)}`;

  return {
    token,
    clientId: evaluation.clientId,
    ruleId: evaluation.ruleId,
    decision: evaluation.decision,
    canonicalDigest,
    hmacSignature,
    timestamp: evaluation.timestamp,
    algorithm: 'HMAC-SHA256-RFC2104-WORM'
  };
}

/**
 * Verifica a autenticidade e inviolabilidade de um selo probatório de rate limiting
 */
export function verifyRateLimitProofSeal(
  seal: RateLimitProofSeal,
  secretKey: string = DEFAULT_RATE_LIMIT_SECRET
): { isValid: boolean; reason?: string } {
  if (!seal || !seal.token || !seal.canonicalDigest || !seal.hmacSignature) {
    return { isValid: false, reason: 'Selo probatório de rate limiting malformado ou incompleto' };
  }

  const hmac = createHmac('sha256', secretKey);
  hmac.update(`${seal.canonicalDigest}:${seal.timestamp}:${seal.decision}`);
  const expectedSignature = hmac.digest('hex');

  if (seal.hmacSignature !== expectedSignature) {
    return {
      isValid: false,
      reason: 'Assinatura HMAC-SHA256 inválida ou payload adulterado'
    };
  }

  const expectedToken = `RL-SEAL-v1-${seal.canonicalDigest.substring(0, 16)}-${seal.hmacSignature.substring(0, 16)}`;
  if (seal.token !== expectedToken) {
    return {
      isValid: false,
      reason: 'Token de identificação do selo probatório incompatível'
    };
  }

  return { isValid: true };
}
