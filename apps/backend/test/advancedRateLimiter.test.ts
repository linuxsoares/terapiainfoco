import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  RateLimitDecision,
  RateLimitTier,
  type AdvancedRateLimitOverviewResponse,
  type EvaluateRateLimitResponse,
  type VerifyRateLimitSealResponse
} from '@terapiainfoco/shared';

describe('Advanced API Rate Limiter Endpoints (OWASP API4:2023 & RFC-001 §4.4, §5.2)', () => {
  it('GET /api/advanced-rate-limiter/overview deve retornar métricas e regras configuradas', async () => {
    const res = await app.request('/api/advanced-rate-limiter/overview');
    expect(res.status).toBe(200);

    const data = await res.json() as AdvancedRateLimitOverviewResponse;
    expect(data.success).toBe(true);
    expect(data.overview.metrics.totalEvaluatedRequests).toBeGreaterThan(0);
    expect(data.overview.rules.length).toBeGreaterThanOrEqual(5);
    expect(data.overview.quarantinedClients.length).toBeGreaterThanOrEqual(1);

    const loginRule = data.overview.rules.find(r => r.id === 'RULE-AUTH-LOGIN');
    expect(loginRule).toBeDefined();
    expect(loginRule?.bucketCapacity).toBe(5);
  });

  describe('POST /api/advanced-rate-limiter/evaluate', () => {
    it('deve autorizar requisição inicial com código 200 e emitir selo probatório', async () => {
      const res = await app.request('/api/advanced-rate-limiter/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'client_legit_user_100',
          path: '/api/auth/login',
          tokensToConsume: 1
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as EvaluateRateLimitResponse;
      expect(data.success).toBe(true);
      expect(data.evaluation.isAllowed).toBe(true);
      expect(data.evaluation.decision).toBe(RateLimitDecision.ALLOWED);
      expect(data.evaluation.remainingTokens).toBeLessThan(5);
      expect(data.proofSeal).toBeDefined();
      expect(data.proofSeal?.token).toMatch(/^RL-SEAL-v1-/);
      expect(res.headers.get('X-RateLimit-Remaining-Tokens')).toBeDefined();
    });

    it('deve limitar com 429 Too Many Requests quando o Token Bucket for esgotado', async () => {
      const burstClientId = 'client_burst_attacker_200';

      // Esgota a capacidade do bucket (5 tokens)
      for (let i = 0; i < 5; i++) {
        await app.request('/api/advanced-rate-limiter/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: burstClientId,
            path: '/api/auth/login',
            tokensToConsume: 1
          })
        });
      }

      // 6ª requisição deve ser throttled
      const throttledRes = await app.request('/api/advanced-rate-limiter/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: burstClientId,
          path: '/api/auth/login',
          tokensToConsume: 1
        })
      });

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.headers.get('Retry-After')).toBeDefined();

      const data = await throttledRes.json() as EvaluateRateLimitResponse;
      expect(data.success).toBe(false);
      expect(data.evaluation.decision).toBe(RateLimitDecision.THROTTLED);
      expect(data.evaluation.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('deve aplicar quarentena automática (403 Forbidden) após 5 violações consecutivas', async () => {
      const quarantineTarget = 'client_persistent_abuser_300';

      // Executa requisições repetidas para acumular violações e forçar quarentena
      for (let i = 0; i < 12; i++) {
        await app.request('/api/advanced-rate-limiter/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: quarantineTarget,
            path: '/api/auth/login',
            tokensToConsume: 2
          })
        });
      }

      // Requisição subsequente deve retornar 403 Forbidden com status QUARANTINED
      const quarantinedRes = await app.request('/api/advanced-rate-limiter/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: quarantineTarget,
          path: '/api/auth/login',
          tokensToConsume: 1
        })
      });

      expect(quarantinedRes.status).toBe(403);
      const data = await quarantinedRes.json() as EvaluateRateLimitResponse;
      expect(data.evaluation.decision).toBe(RateLimitDecision.QUARANTINED);
      expect(data.evaluation.quarantinedUntil).toBeDefined();
    });

    it('deve retornar 400 se clientId ou path não forem fornecidos', async () => {
      const res = await app.request('/api/advanced-rate-limiter/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'only_client' })
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/advanced-rate-limiter/rules/configure', () => {
    it('deve reconfigurar parâmetros de regra e retornar sucesso', async () => {
      const res = await app.request('/api/advanced-rate-limiter/rules/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: 'RULE-AUTH-LOGIN',
          bucketCapacity: 8,
          refillRatePerSecond: 2
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; rule: any };
      expect(data.success).toBe(true);
      expect(data.rule.bucketCapacity).toBe(8);
      expect(data.rule.refillRatePerSecond).toBe(2);
    });
  });

  describe('POST /api/advanced-rate-limiter/clients/reset', () => {
    it('deve liberar cliente da quarentena e zerar contadores', async () => {
      const res = await app.request('/api/advanced-rate-limiter/clients/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: '185.220.101.42',
          reason: 'Homologação pericial concluída'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('liberado da quarentena');
    });
  });

  describe('POST /api/advanced-rate-limiter/verify-seal', () => {
    it('deve validar um selo probatório emitido com status 200', async () => {
      // 1. Emite um selo avaliando requisição
      const evalRes = await app.request('/api/advanced-rate-limiter/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'client_audit_seal_test',
          path: '/api/clinical-records/sign'
        })
      });
      const evalData = await evalRes.json() as EvaluateRateLimitResponse;
      const token = evalData.proofSeal!.token;

      // 2. Valida o selo
      const verifyRes = await app.request('/api/advanced-rate-limiter/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: token })
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json() as VerifyRateLimitSealResponse;
      expect(verifyData.success).toBe(true);
      expect(verifyData.isValid).toBe(true);
      expect(verifyData.seal?.token).toBe(token);
    });

    it('deve retornar 422 para token inexistente', async () => {
      const res = await app.request('/api/advanced-rate-limiter/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofSealToken: 'RL-SEAL-v1-invalid-token' })
      });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/advanced-rate-limiter/rules', () => {
    it('deve listar todas as regras ativas', async () => {
      const res = await app.request('/api/advanced-rate-limiter/rules');
      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; rules: any[] };
      expect(data.success).toBe(true);
      expect(data.rules.length).toBeGreaterThanOrEqual(5);
    });
  });
});
