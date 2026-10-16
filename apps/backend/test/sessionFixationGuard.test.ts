/**
 * Testes de Integração da API REST de Proteção contra Fixação e Sequestro de Sessão
 * (OWASP ASVS v4.0 V3.3, CWE-384, CWE-287 & NIST SP 800-63B)
 */

import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  SessionAnomalyType,
  SessionMitigationAction,
  type SessionGuardOverviewResponse,
  type EvaluateSessionResponse,
  type RotateSessionResponse,
  type UpdateSessionGuardPolicyResponse,
  type SimulateSessionAttackResponse,
  type VerifySessionSealResponse
} from '@terapiainfoco/shared';

describe('Session Fixation & Hijacking Guard REST API (/api/session-guard)', () => {
  it('GET /api/session-guard/overview - deve retornar telemetria, políticas e sessões ativas', async () => {
    const res = await app.request('/api/session-guard/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionGuardOverviewResponse;
    expect(body.success).toBe(true);
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.policy).toBeDefined();
    expect(body.overview.recentIncidents).toBeInstanceOf(Array);
    expect(body.overview.activeSessionsSample).toBeInstanceOf(Array);
  });

  it('POST /api/session-guard/evaluate - deve aprovar requisição de sessão clínica íntegra', async () => {
    const testSessionId = 'sess_sec_test_valid_client_001';
    const clientIp = '198.51.100.50';
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0';

    const res = await app.request('/api/session-guard/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: testSessionId,
        clientIp,
        userAgent,
        countryCode: 'BR'
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as EvaluateSessionResponse;
    expect(body.success).toBe(true);
    expect(body.evaluation.isAllowed).toBe(true);
    expect(body.evaluation.anomalies.length).toBe(0);
    expect(body.evaluation.seal.sealId).toStartWith('session_guard_v1_');
  });

  it('POST /api/session-guard/evaluate - deve bloquear sequestro de sessão se houver mutação de User-Agent', async () => {
    const testSessionId = 'sess_sec_test_hijack_probe_002';
    const clientIp = '198.51.100.75';
    const legitimateUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0';

    // 1. Inicializa a sessão com cliente legítimo
    await app.request('/api/session-guard/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: testSessionId,
        clientIp,
        userAgent: legitimateUa,
        countryCode: 'BR'
      })
    });

    // 2. Atacante tenta usar o mesmo sessionId com outro User-Agent (ex: Python/curl)
    const hijackRes = await app.request('/api/session-guard/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: testSessionId,
        clientIp,
        userAgent: 'curl/8.4.0 (Adversary Exfiltration Probe)',
        countryCode: 'BR'
      })
    });

    expect(hijackRes.status).toBe(200);
    const hijackBody = (await hijackRes.json()) as EvaluateSessionResponse;
    expect(hijackBody.success).toBe(false);
    expect(hijackBody.evaluation.isAllowed).toBe(false);
    expect(hijackBody.evaluation.action).toBe(SessionMitigationAction.IMMEDIATE_REVOCATION);
    expect(hijackBody.evaluation.anomalies.some(a => a.type === SessionAnomalyType.USER_AGENT_MUTATION)).toBe(true);
  });

  it('POST /api/session-guard/rotate - deve rotacionar sessão gerando novo ID e invalidando pré-autenticação', async () => {
    const preAuthId = 'sess_pre_auth_anonymous_1234';
    const clientIp = '198.51.100.80';
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

    const res = await app.request('/api/session-guard/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldSessionId: preAuthId,
        userId: 'usr_rot_test_01',
        userRole: 'PSICOLOGO_TITULAR',
        clientIp,
        userAgent
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as RotateSessionResponse;
    expect(body.success).toBe(true);
    expect(body.newSessionId).toStartWith('sess_sec_');
    expect(body.newSessionId).not.toBe(preAuthId);
    expect(body.oldSessionInvalidated).toBe(true);
    expect(body.seal.sealId).toStartWith('session_guard_v1_');

    // Agora tenta reutilizar o ID pré-autenticação para validar proteção contra Session Fixation (CWE-384)
    const reuseRes = await app.request('/api/session-guard/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: preAuthId,
        clientIp,
        userAgent
      })
    });

    const reuseBody = (await reuseRes.json()) as EvaluateSessionResponse;
    expect(reuseBody.success).toBe(false);
    expect(reuseBody.evaluation.isAllowed).toBe(false);
    expect(reuseBody.evaluation.anomalies.some(a => a.type === SessionAnomalyType.PRE_AUTH_SESSION_REUSE)).toBe(true);
  });

  it('PUT /api/session-guard/policy - deve atualizar parâmetros de política e registrar no WORM', async () => {
    const res = await app.request('/api/session-guard/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: {
          maxSessionAgeMinutes: 360,
          idleTimeoutMinutes: 15
        }
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as UpdateSessionGuardPolicyResponse;
    expect(body.success).toBe(true);
    expect(body.policy.maxSessionAgeMinutes).toBe(360);
    expect(body.policy.idleTimeoutMinutes).toBe(15);
  });

  it('POST /api/session-guard/simulate - deve executar probe adversarial e neutralizar ataque simulado', async () => {
    const res = await app.request('/api/session-guard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anomalyType: SessionAnomalyType.GEOGRAPHIC_IMPOSSIBLE_TRAVEL
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SimulateSessionAttackResponse;
    expect(body.success).toBe(true);
    expect(body.threatDetected).toBe(true);
    expect(body.incident).toBeDefined();
    expect(body.evaluation.isAllowed).toBe(false);
  });

  it('POST /api/session-guard/verify-seal - deve verificar autenticidade de selo emitido e rejeitar forjado', async () => {
    // 1. Gera um selo autêntico via evaluate
    const evalRes = await app.request('/api/session-guard/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_sec_for_seal_test',
        clientIp: '198.51.100.90',
        userAgent: 'Mozilla/5.0 Chrome/120.0'
      })
    });
    const evalBody = (await evalRes.json()) as EvaluateSessionResponse;
    const validSeal = evalBody.evaluation.seal;

    // 2. Valida selo original
    const verifyRes = await app.request('/api/session-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: validSeal
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as VerifySessionSealResponse;
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.isValid).toBe(true);
    expect(verifyBody.seal).toBeDefined();

    // 3. Rejeita selo adulterado
    const tamperedSeal = { ...validSeal, anomalyCount: 999 };
    const tamperedRes = await app.request('/api/session-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: tamperedSeal
      })
    });

    expect(tamperedRes.status).toBe(200);
    const tamperedBody = (await tamperedRes.json()) as VerifySessionSealResponse;
    expect(tamperedBody.success).toBe(true);
    expect(tamperedBody.isValid).toBe(false);
  });
});
