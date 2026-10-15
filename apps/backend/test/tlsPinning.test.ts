import { describe, expect, it } from 'bun:test';
import { app } from '../src/index';

describe('Backend API — Rotas de TLS Certificate Pinning & Rotação de CAs (RFC-001 §4.4, §5.2 e OWASP MASVS)', () => {
  let sampleSealToken = '';

  it('GET /api/tls-pinning/overview — deve retornar a visão geral executiva e métricas de pins', async () => {
    const res = await app.request('/api/tls-pinning/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.activePinsCount).toBeGreaterThanOrEqual(4);
    expect(data.overview.metrics.primaryPinsCount).toBeGreaterThanOrEqual(2);
    expect(data.overview.pins.some((p: any) => p.hostname === 'api.terapiainfoco.com.br')).toBe(true);
    expect(data.overview.quarantinedCAs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/tls-pinning/validate — deve rejeitar requisição sem hostname com HTTP 400', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('hostname é obrigatório');
  });

  it('POST /api/tls-pinning/validate — deve validar e aprovar conexão legítima (PIN_MATCH_PRIMARY)', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        simulatedScenario: 'LEGITIMATE_LETS_ENCRYPT'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('PIN_MATCH_PRIMARY');
    expect(data.result.threatLevel).toBe('NONE');
    expect(data.result.chainValid).toBe(true);
    expect(data.result.proofSeal.token).toBeDefined();

    sampleSealToken = data.result.proofSeal.token;
  });

  it('POST /api/tls-pinning/validate — deve bloquear ataque MitM com Burp Suite CA (CHAIN_UNTRUSTED_ROGUE_CA)', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        simulatedScenario: 'BURP_MITM_PROXY'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('CHAIN_UNTRUSTED_ROGUE_CA');
    expect(data.result.threatLevel).toBe('CRITICAL_MITM');
    expect(data.result.chainValid).toBe(false);
    expect(data.result.mitmSignaturesDetected.some((s: string) => s.includes('PortSwigger'))).toBe(true);
  });

  it('POST /api/tls-pinning/validate — deve acusar CERTIFICATE_EXPIRED em certificado vencido', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        simulatedScenario: 'EXPIRED_CERTIFICATE'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('CERTIFICATE_EXPIRED');
    expect(data.result.threatLevel).toBe('HIGH');
  });

  it('POST /api/tls-pinning/validate — deve acusar SAN_MISMATCH quando certificado divergir do domínio', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        simulatedScenario: 'SAN_SPOOFING'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('SAN_MISMATCH');
    expect(data.result.threatLevel).toBe('HIGH');
  });

  it('POST /api/tls-pinning/validate — deve reconhecer Backup Pin de Rotação Suave (PIN_MATCH_BACKUP)', async () => {
    const res = await app.request('/api/tls-pinning/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        simulatedScenario: 'BACKUP_ROTATION_TEST'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe('PIN_MATCH_BACKUP');
    expect(data.result.threatLevel).toBe('LOW');
  });

  it('POST /api/tls-pinning/register-pin — deve cadastrar novo Pin SPKI de contingência com HTTP 201', async () => {
    const res = await app.request('/api/tls-pinning/register-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'auth.terapiainfoco.com.br',
        spkiSha256: 'pin-sha256="NEW_AUTH_TEST_PIN_KEY_SAMPLE=="',
        type: 'BACKUP_ROTATION',
        caIssuer: 'Cloudflare Origin CA',
        subjectCommonName: 'auth.terapiainfoco.com.br',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T23:59:59.000Z'
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.pin.hostname).toBe('auth.terapiainfoco.com.br');
    expect(data.pin.type).toBe('BACKUP_ROTATION');
  });

  it('POST /api/tls-pinning/rotate-ca — deve executar rotação atômica de CA promovendo Backup Pin a Primary', async () => {
    const res = await app.request('/api/tls-pinning/rotate-ca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: 'api.terapiainfoco.com.br',
        newPrimaryPinId: 'pin-api-backup-digicert-g2',
        reason: 'Rotação programada semestral de autoridade certificadora'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.promotedPin.pinId).toBe('pin-api-backup-digicert-g2');
    expect(data.promotedPin.type).toBe('PRIMARY');
    expect(data.demotedPin?.type).toBe('BACKUP_ROTATION');
  });

  it('POST /api/tls-pinning/quarantine-ca — deve colocar CA suspeita em quarentena compulsória', async () => {
    const res = await app.request('/api/tls-pinning/quarantine-ca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caCommonNameOrIdentifier: 'Insecure Compromised Testing CA',
        reason: 'Vazamento de chave privada intermediária relatado no CERT'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.quarantinedCa).toBe('Insecure Compromised Testing CA');
  });

  it('POST /api/tls-pinning/verify-seal — deve atestar com 100% de autenticidade selo emitido na validação', async () => {
    expect(sampleSealToken).toMatch(/^tls_pin_v1_/);

    const res = await app.request('/api/tls-pinning/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: sampleSealToken
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isValid).toBe(true);
    expect(data.seal).toBeDefined();
    expect(data.seal.hostname).toBe('api.terapiainfoco.com.br');
  });
});
