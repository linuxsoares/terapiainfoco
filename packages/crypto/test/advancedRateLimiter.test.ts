import { describe, it, expect } from 'bun:test';
import {
  refillTokenBucket,
  consumeTokenBucket,
  evaluateSlidingWindow,
  evaluateAdvancedRateLimit,
  calculateRateLimitCanonicalDigest,
  createRateLimitProofSeal,
  verifyRateLimitProofSeal
} from '../src/advancedRateLimiter';
import {
  RateLimitingAlgorithm,
  RateLimitTier,
  RateLimitDecision,
  type RateLimitRuleConfig,
  type TokenBucketState,
  type SlidingWindowLogEntry
} from '@terapiainfoco/shared';

describe('Advanced API Rate Limiter Engine (Token Bucket + Sliding Window Log - OWASP API4:2023)', () => {
  const baseRule: RateLimitRuleConfig = {
    id: 'RULE-LOGIN-SENSITIVE',
    name: 'Proteção de Autenticação & Brute-Force',
    pathPattern: '/api/auth/login',
    tier: RateLimitTier.PUBLIC_ANONYMOUS,
    algorithm: RateLimitingAlgorithm.HYBRID_TOKEN_BUCKET_SLIDING_WINDOW,
    bucketCapacity: 5,
    refillRatePerSecond: 1, // 1 token por segundo
    windowSizeSeconds: 60,
    maxRequestsPerWindow: 10,
    burstAllowanceMultiplier: 1.5,
    penaltyQuarantineMinutes: 15,
    description: 'Limite rigoroso de autenticação com recarga fracionária e janela deslizante'
  };

  describe('Token Bucket com Recarga Fracionária Temporal', () => {
    it('deve recarregar tokens proporcionalmente ao tempo decorrido sem exceder a capacidade', () => {
      const initialBucket: TokenBucketState = {
        tokens: 2,
        capacity: 10,
        refillRatePerSecond: 2, // 2 tokens por segundo
        lastRefillTimestampMs: 1000
      };

      // 2 segundos depois (+4 tokens) -> 6 tokens
      const refilled = refillTokenBucket(initialBucket, 3000);
      expect(refilled.tokens).toBe(6);
      expect(refilled.lastRefillTimestampMs).toBe(3000);

      // 10 segundos depois (+20 tokens) -> limitada à capacidade (10)
      const maxed = refillTokenBucket(initialBucket, 11000);
      expect(maxed.tokens).toBe(10);
    });

    it('deve permitir consumo de tokens disponíveis e deduzir a quantidade consumida', () => {
      const bucket: TokenBucketState = {
        tokens: 5,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };

      const res = consumeTokenBucket(bucket, 2, 1000);
      expect(res.allowed).toBe(true);
      expect(res.updatedBucket.tokens).toBe(3);
      expect(res.retryAfterSeconds).toBe(0);
    });

    it('deve rejeitar consumo caso tokens sejam insuficientes e calcular Retry-After exato', () => {
      const bucket: TokenBucketState = {
        tokens: 0.5,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };

      // Tenta consumir 2 tokens, necessita de 1.5 tokens a 1 token/s -> ceil(1.5) = 2s
      const res = consumeTokenBucket(bucket, 2, 1000);
      expect(res.allowed).toBe(false);
      expect(res.retryAfterSeconds).toBe(2);
    });
  });

  describe('Sliding Window Log Preciso', () => {
    it('deve autorizar requisições dentro da cota da janela e acumular no log', () => {
      const log: SlidingWindowLogEntry[] = [];
      const res = evaluateSlidingWindow(log, 60, 5, 1, 10000);

      expect(res.allowed).toBe(true);
      expect(res.currentCount).toBe(1);
      expect(res.updatedLog.length).toBe(1);
    });

    it('deve descartar entradas expiradas fora do intervalo da janela deslizante', () => {
      const log: SlidingWindowLogEntry[] = [
        { timestampMs: 1000, weight: 1 },  // Expirado para janela de 60s em t = 70000
        { timestampMs: 2000, weight: 1 },  // Expirado
        { timestampMs: 50000, weight: 1 }  // Válido (dentro de 70000 - 60000 = 10000)
      ];

      const res = evaluateSlidingWindow(log, 60, 5, 1, 70000);
      expect(res.allowed).toBe(true);
      expect(res.currentCount).toBe(2); // 1 pré-existente válido + 1 novo
      expect(res.updatedLog.length).toBe(2);
    });

    it('deve rejeitar requisição caso o volume agregado da janela atinja o máximo permitido', () => {
      const log: SlidingWindowLogEntry[] = [
        { timestampMs: 65000, weight: 2 },
        { timestampMs: 68000, weight: 2 }
      ];

      // Janela de 60s, cota de 4 requisições. Já temos 4. Tenta adicionar 1 -> deve rejeitar
      const res = evaluateSlidingWindow(log, 60, 4, 1, 70000);
      expect(res.allowed).toBe(false);
      expect(res.currentCount).toBe(4);
      expect(res.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('Algoritmo Híbrido (HYBRID_TOKEN_BUCKET_SLIDING_WINDOW)', () => {
    it('deve autorizar quando tanto o Token Bucket quanto o Sliding Window aprovarem', () => {
      const bucket: TokenBucketState = {
        tokens: 5,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };
      const windowLog: SlidingWindowLogEntry[] = [];

      const evalRes = evaluateAdvancedRateLimit({
        clientId: 'client_therapist_01',
        rule: baseRule,
        bucket,
        windowLog,
        tokensToConsume: 1,
        nowMs: 1000
      });

      expect(evalRes.result.isAllowed).toBe(true);
      expect(evalRes.result.decision).toBe(RateLimitDecision.ALLOWED);
      expect(evalRes.result.remainingTokens).toBe(4);
      expect(evalRes.result.currentWindowCount).toBe(1);
    });

    it('deve bloquear por burst se o Token Bucket esgotar, mesmo com janela sliding vazia', () => {
      const emptyBucket: TokenBucketState = {
        tokens: 0,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };
      const windowLog: SlidingWindowLogEntry[] = [];

      const evalRes = evaluateAdvancedRateLimit({
        clientId: 'client_attacker_burst',
        rule: baseRule,
        bucket: emptyBucket,
        windowLog,
        tokensToConsume: 1,
        nowMs: 1000
      });

      expect(evalRes.result.isAllowed).toBe(false);
      expect(evalRes.result.decision).toBe(RateLimitDecision.THROTTLED);
      expect(evalRes.result.retryAfterSeconds).toBeGreaterThan(0);
      expect(evalRes.result.reason).toContain('Token Bucket esgotado');
    });

    it('deve bloquear e fazer rollback de tokens se o Sliding Window for excedido', () => {
      const fullBucket: TokenBucketState = {
        tokens: 5,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };
      // Simula sliding window lotada com 10 requisições
      const fullLog: SlidingWindowLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
        timestampMs: 50000 + i * 1000,
        weight: 1
      }));

      const evalRes = evaluateAdvancedRateLimit({
        clientId: 'client_exhaustion',
        rule: baseRule,
        bucket: fullBucket,
        windowLog: fullLog,
        tokensToConsume: 1,
        nowMs: 65000
      });

      expect(evalRes.result.isAllowed).toBe(false);
      expect(evalRes.result.decision).toBe(RateLimitDecision.THROTTLED);
      // Confirma que os tokens do bucket não foram perdidos (rollback)
      expect(evalRes.updatedBucket.tokens).toBe(5);
      expect(evalRes.result.reason).toContain('Volume agregado de requisições excedido');
    });

    it('deve aplicar QUARANTINED de imediato se o cliente estiver em quarentena ativa', () => {
      const bucket: TokenBucketState = {
        tokens: 5,
        capacity: 5,
        refillRatePerSecond: 1,
        lastRefillTimestampMs: 1000
      };
      const quarantinedUntil = new Date(Date.now() + 600000).toISOString(); // 10 min no futuro

      const evalRes = evaluateAdvancedRateLimit({
        clientId: 'client_quarantined_bad_actor',
        rule: baseRule,
        bucket,
        windowLog: [],
        isQuarantined: true,
        quarantinedUntil,
        nowMs: Date.now()
      });

      expect(evalRes.result.isAllowed).toBe(false);
      expect(evalRes.result.decision).toBe(RateLimitDecision.QUARANTINED);
      expect(evalRes.result.retryAfterSeconds).toBeGreaterThan(500);
      expect(evalRes.result.reason).toContain('quarentena de segurança');
    });
  });

  describe('Selo Probatório WORM HMAC-SHA256 para Auditoria Regulatória', () => {
    it('deve gerar digest canônico determinístico e invariante', () => {
      const bucket: TokenBucketState = { tokens: 5, capacity: 5, refillRatePerSecond: 1, lastRefillTimestampMs: 1000 };
      const evalRes = evaluateAdvancedRateLimit({ clientId: 'client_01', rule: baseRule, bucket, windowLog: [] });

      const digest1 = calculateRateLimitCanonicalDigest(evalRes.result);
      const digest2 = calculateRateLimitCanonicalDigest(evalRes.result);
      expect(digest1).toBe(digest2);
      expect(digest1.length).toBe(64);
    });

    it('deve emitir e validar selo probatório com 100% de sucesso', () => {
      const bucket: TokenBucketState = { tokens: 5, capacity: 5, refillRatePerSecond: 1, lastRefillTimestampMs: 1000 };
      const evalRes = evaluateAdvancedRateLimit({ clientId: 'client_01', rule: baseRule, bucket, windowLog: [] });
      const seal = createRateLimitProofSeal(evalRes.result);

      expect(seal.token).toMatch(/^RL-SEAL-v1-/);
      expect(seal.algorithm).toBe('HMAC-SHA256-RFC2104-WORM');

      const verification = verifyRateLimitProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.reason).toBeUndefined();
    });

    it('deve acusar falha de verificação caso o token ou assinatura HMAC sejam adulterados', () => {
      const bucket: TokenBucketState = { tokens: 5, capacity: 5, refillRatePerSecond: 1, lastRefillTimestampMs: 1000 };
      const evalRes = evaluateAdvancedRateLimit({ clientId: 'client_01', rule: baseRule, bucket, windowLog: [] });
      const seal = createRateLimitProofSeal(evalRes.result);

      const tamperedSeal = {
        ...seal,
        hmacSignature: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      };

      const verification = verifyRateLimitProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('inválida ou payload adulterado');
    });
  });
});
