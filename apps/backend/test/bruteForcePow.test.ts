import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { bruteForcePowRoute } from '../src/routes/bruteForcePow';
import { BruteForcePowService } from '../src/services/bruteForcePowService';
import {
  PowDifficultyTier,
  BruteForceThreatCategory
} from '@terapiainfoco/shared';
import { solvePowChallenge } from '@terapiainfoco/crypto';

describe('Backend API — Defesa Ativa contra Força Bruta & PoW Criptográfico (RFC-001 §4.4, OWASP OAT-007 / OAT-008)', () => {
  let app: Hono;
  let service: BruteForcePowService;

  beforeEach(() => {
    service = BruteForcePowService.getInstance();
    service.seedDemoData();
    app = new Hono();
    app.route('/api/brute-force-pow', bruteForcePowRoute);
  });

  it('GET /api/brute-force-pow/overview — deve retornar governança executiva de força bruta e lista de IPs', async () => {
    const res = await app.request('/api/brute-force-pow/overview');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.overview).toBeDefined();
    expect(json.overview.totalChallengesIssued).toBeGreaterThan(0);
    expect(json.overview.automatedAttacksMitigated).toBeGreaterThan(0);
    expect(json.overview.activeIpQuarantinesCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(json.overview.recentIpIncidents)).toBe(true);
  });

  it('POST /api/brute-force-pow/challenge — deve emitir desafio proporcional ao histórico do IP', async () => {
    // 1. IP Seguro: Dificuldade 0 (PoW dispensado)
    const cleanRes = await app.request('/api/brute-force-pow/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '189.120.45.10' }
    });
    expect(cleanRes.status).toBe(200);
    const cleanJson = await cleanRes.json();
    expect(cleanJson.requiresPoW).toBe(false);
    expect(cleanJson.difficulty).toBe(0);

    // 2. IP com falhas repetidas (177.18.230.88): Dificuldade elevada (PoW requerido)
    const suspectRes = await app.request('/api/brute-force-pow/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' }
    });
    expect(suspectRes.status).toBe(200);
    const suspectJson = await suspectRes.json();
    expect(suspectJson.requiresPoW).toBe(true);
    expect(suspectJson.difficulty).toBeGreaterThan(0);
    expect(suspectJson.challenge.hmacSignature).toBeDefined();
  });

  it('POST /api/brute-force-pow/verify — deve validar solução correta de PoW e emitir selo WORM', async () => {
    // Solicita desafio para o IP suspeito
    const chalRes = await app.request('/api/brute-force-pow/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' }
    });
    const { challenge } = await chalRes.json();

    // Resolve o puzzle criptográfico
    const solution = solvePowChallenge(challenge);

    // Submete solução ao backend
    const verifyRes = await app.request('/api/brute-force-pow/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' },
      body: JSON.stringify({
        challenge,
        nonce: solution.nonce,
        clientDurationMs: solution.durationMs
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.verification.isValid).toBe(true);
    expect(verifyJson.defenseSeal).toStartWith('pow_proof_v1_');
  });

  it('POST /api/brute-force-pow/verify — deve bloquear tentativa de Replay Attack com mesmo desafio consumido', async () => {
    const chalRes = await app.request('/api/brute-force-pow/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' }
    });
    const { challenge } = await chalRes.json();
    const solution = solvePowChallenge(challenge);

    // 1ª submissão: Sucesso
    const res1 = await app.request('/api/brute-force-pow/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' },
      body: JSON.stringify({ challenge, nonce: solution.nonce })
    });
    expect(res1.status).toBe(200);

    // 2ª submissão idêntica: Replay Attack bloqueado
    const res2 = await app.request('/api/brute-force-pow/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '177.18.230.88' },
      body: JSON.stringify({ challenge, nonce: solution.nonce })
    });
    expect(res2.status).toBe(401);
    const json2 = await res2.json();
    expect(json2.success).toBe(false);
    expect(json2.message).toContain('Replay Attack');
  });

  it('POST /api/brute-force-pow/simulate-attack — deve conter rajada de Credential Stuffing elevando para dificuldade máxima', async () => {
    const res = await app.request('/api/brute-force-pow/simulate-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '198.51.100.44',
        attemptsCount: 25,
        threatCategory: BruteForceThreatCategory.CREDENTIAL_STUFFING
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.attackSimulated).toBe(true);
    expect(json.attemptsBlocked).toBe(25);
    expect(json.finalDifficultyTier).toBe(PowDifficultyTier.MAXIMUM);
    expect(json.ipReputation.isBlocked).toBe(true);
    expect(json.defenseSeal).toStartWith('pow_proof_v1_');
  });

  it('POST /api/brute-force-pow/reset-ip — deve remover quarentena de IP com justificativa formal gravada no WORM', async () => {
    const res = await app.request('/api/brute-force-pow/reset-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '198.51.100.99',
        reason: 'Falso positivo comprovado por auditoria forense do DPO'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ipAddress).toBe('198.51.100.99');

    // Valida que o IP não está mais bloqueado
    const overviewRes = await app.request('/api/brute-force-pow/overview');
    const overviewJson = await overviewRes.json();
    const target = overviewJson.overview.recentIpIncidents.find((i: any) => i.ipAddress === '198.51.100.99');
    expect(target.isBlocked).toBe(false);
    expect(target.currentDifficultyTier).toBe(PowDifficultyTier.NONE);
  });

  it('POST /api/brute-force-pow/verify-seal — deve atestar fé pública e integridade matemática do selo WORM', async () => {
    const simRes = await app.request('/api/brute-force-pow/simulate-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: '201.83.112.5',
        attemptsCount: 15,
        threatCategory: BruteForceThreatCategory.DICTIONARY_ATTACK
      })
    });
    const { defenseSeal } = await simRes.json();

    const verifyRes = await app.request('/api/brute-force-pow/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seal: defenseSeal })
    });

    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.verification.isValid).toBe(true);
    expect(verifyJson.verification.details).toContain('matematicamente autêntico');
  });
});
