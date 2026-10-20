import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { sessionBindingRoute } from '../src/routes/sessionBinding';
import { SessionBindingService } from '../src/services/sessionBindingService';
import {
  SessionLifecycleStatus,
  SessionDeviceType
} from '@terapiainfoco/shared';
import {
  generateClientDeviceKeyPair,
  createDpopProof
} from '@terapiainfoco/crypto';
import { adminRequest } from './helpers/adminRequest';

describe('Backend API — Gestão de Sessões Clínicas com Token Binding e Revogação Concorrente (RFC-001 §4.4)', () => {
  let app: Hono;
  let service: SessionBindingService;

  beforeEach(() => {
    service = SessionBindingService.getInstance();
    service.seedDemoSessions();
    app = new Hono();
    app.route('/api/session-binding', sessionBindingRoute);
  });

  it('GET /api/session-binding/overview — deve retornar indicadores de governança de sessões e DPoP', async () => {
    const res = await adminRequest('/api/session-binding/overview?userId=user-therapist-001');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.overview).toBeDefined();
    expect(json.overview.totalActiveSessions).toBe(2);
    expect(json.overview.dpopBoundPercentage).toBe(100);
    expect(json.overview.concurrencyLimitPerTherapist).toBe(2);
    expect(json.overview.activeSessions.length).toBe(2);
  });

  it('GET /api/session-binding/sessions — deve listar sessões e sinalizar a sessão corrente', async () => {
    const res = await adminRequest('/api/session-binding/sessions?userId=user-therapist-001&currentSessionId=sess-active-chrome-01');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.sessions)).toBe(true);
    expect(json.total).toBe(3);

    const current = json.sessions.find((s: any) => s.sessionId === 'sess-active-chrome-01');
    expect(current).toBeDefined();
    expect(current.isCurrentDevice).toBe(true);
    expect(current.status).toBe(SessionLifecycleStatus.ACTIVE);
  });

  it('POST /api/session-binding/terminate — deve encerrar forçadamente um dispositivo e emitir selo WORM', async () => {
    const res = await adminRequest('/api/session-binding/terminate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess-active-ios-02',
        reason: 'Dispositivo esquecido em consultório compartilhado'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.terminatedSessionId).toBe('sess-active-ios-02');
    expect(json.proofSeal).toBeDefined();
    expect(json.proofSeal).toStartWith('session_rev_v1_');

    // Valida que a sessão agora está inativa no overview
    const overviewRes = await adminRequest('/api/session-binding/overview');
    const overviewJson = await overviewRes.json();
    expect(overviewJson.overview.totalActiveSessions).toBe(1);

    // Valida fé pública do selo gerado via rota de verificação pericial
    const verifyRes = await adminRequest(`/api/session-binding/verify-seal/${json.terminatedSessionId}`);
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.verification.isValid).toBe(true);
  });

  it('POST /api/session-binding/terminate-others — deve acionar Kill Switch remoto encerrando todas as outras sessões', async () => {
    const res = await adminRequest('/api/session-binding/terminate-others', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentSessionId: 'sess-active-chrome-01',
        reason: 'Auditoria de segurança de rotina — desconectar outros dispositivos'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.terminatedCount).toBe(1); // Era 2 ativas, matou 1
    expect(json.terminatedSessionIds).toContain('sess-active-ios-02');

    // Verifica que apenas a sessão principal permanece ativa
    const listRes = await adminRequest('/api/session-binding/sessions');
    const listJson = await listRes.json();
    const activeSessions = listJson.sessions.filter((s: any) => s.status === SessionLifecycleStatus.ACTIVE);
    expect(activeSessions.length).toBe(1);
    expect(activeSessions[0].sessionId).toBe('sess-active-chrome-01');
  });

  it('POST /api/session-binding/simulate-concurrent (EXCEED_CONCURRENCY_LIMIT) — deve expulsar a sessão mais antiga ao exceder o limite', async () => {
    // Inicialmente temos 2 sessões ativas: sess-active-chrome-01 e sess-active-ios-02 (mais antiga)
    const res = await adminRequest('/api/session-binding/simulate-concurrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'user-therapist-001',
        scenario: 'EXCEED_CONCURRENCY_LIMIT',
        deviceName: 'Workstation Consultório 2 (Linux)',
        ipAddress: '200.140.80.30'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.actionTaken).toBe('REVOKED_OLDER_SESSION');
    expect(json.revokedSessionId).toBe('sess-active-ios-02'); // A mais antiga foi revogada
    expect(json.proofSeal).toStartWith('session_rev_v1_');
    expect(json.session).toBeDefined();
  });

  it('POST /api/session-binding/simulate-concurrent (TOKEN_REPLAY_ATTACK) — deve interceptar ataque de replay com chave divergente', async () => {
    const res = await adminRequest('/api/session-binding/simulate-concurrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'user-therapist-001',
        scenario: 'TOKEN_REPLAY_ATTACK',
        deviceName: 'Hacker Kali Linux Device',
        ipAddress: '198.51.100.99'
      })
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.actionTaken).toBe('BLOCKED_TOKEN_BINDING_MISMATCH');
    expect(json.message).toContain('Replay interceptado');
  });

  it('POST /api/session-binding/verify-dpop — deve validar prova DPoP legítima e recusar prova inválida', async () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/clinical-records';
    const method = 'POST';
    const accessToken = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.dummy_access_token';

    const validDpopJwt = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: method,
      httpUri: uri,
      accessToken
    });

    // 1. Prova válida
    const validRes = await adminRequest('/api/session-binding/verify-dpop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dpopProof: validDpopJwt,
        httpMethod: method,
        httpUri: uri,
        accessToken
      })
    });

    expect(validRes.status).toBe(200);
    const validJson = await validRes.json();
    expect(validJson.success).toBe(true);
    expect(validJson.verification.isValid).toBe(true);
    expect(validJson.verification.clientThumbprint).toBe(keyPair.thumbprint);

    // 2. Prova com divergência de método (ex: GET em vez de POST)
    const invalidRes = await adminRequest('/api/session-binding/verify-dpop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dpopProof: validDpopJwt,
        httpMethod: 'GET',
        httpUri: uri,
        accessToken
      })
    });

    expect(invalidRes.status).toBe(401);
    const invalidJson = await invalidRes.json();
    expect(invalidJson.success).toBe(false);
    expect(invalidJson.verification.isValid).toBe(false);
    expect(invalidJson.verification.error).toContain('Método HTTP DPoP divergente');
  });
});
