import { describe, expect, it } from 'bun:test';
import { app } from '../src/index';
import { adminRequest } from './helpers/adminRequest';

describe('Backend API — Avaliação Contínua de Postura de Dispositivo Zero Trust (NIST SP 800-207 & OWASP MASVS)', () => {
  let sampleSealToken = '';

  it('GET /api/device-posture/overview — deve retornar visão consolidada de métricas e dispositivos', async () => {
    const res = await adminRequest('/api/device-posture/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalDevicesMonitored).toBeGreaterThanOrEqual(4);
    expect(data.overview.metrics.trustedCount).toBeGreaterThanOrEqual(1);
    expect(data.overview.registeredDevices.length).toBeGreaterThanOrEqual(4);
    expect(data.overview.recentAssessments.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/device-posture/assess — deve avaliar terminal corporativo conforme (COMPLIANT_MAC_WORKSTATION)', async () => {
    const res = await adminRequest('/api/device-posture/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_test_mac_01',
        deviceName: 'MacBook Pro do Titular (Teste)',
        simulatedScenario: 'COMPLIANT_MAC_WORKSTATION'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assessment).toBeDefined();
    expect(data.assessment.trustScore).toBeGreaterThanOrEqual(85);
    expect(data.assessment.trustTier).toBe('TRUSTED');
    expect(data.assessment.decision).toBe('ALLOWED');
    expect(data.assessment.violations.length).toBe(0);
    expect(data.assessment.proofSeal.token.startsWith('posture_proof_v1_')).toBe(true);

    sampleSealToken = data.assessment.proofSeal.token;
  });

  it('POST /api/device-posture/assess — deve bloquear terminal comprometido com Root e Frida (ROOTED_ANDROID_WITH_FRIDA)', async () => {
    const res = await adminRequest('/api/device-posture/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_test_android_hostile',
        deviceName: 'Terminal Hostil com Root',
        simulatedScenario: 'ROOTED_ANDROID_WITH_FRIDA'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assessment.trustScore).toBeLessThan(40);
    expect(data.assessment.trustTier).toBe('UNTRUSTED_BLOCKED');
    expect(data.assessment.decision).toBe('BLOCKED_QUARANTINED');
    expect(data.assessment.violations.some((v: any) => v.category === 'ROOT_JAILBREAK_DETECTED')).toBe(true);
  });

  it('POST /api/device-posture/assess — deve exigir Step-up 2FA para terminal com disco descriptografado', async () => {
    const res = await adminRequest('/api/device-posture/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_test_unencrypted_win',
        deviceName: 'Notebook Windows Teste',
        simulatedScenario: 'UNENCRYPTED_DISK_WINDOWS'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assessment.trustScore).toBe(80);
    expect(data.assessment.trustTier).toBe('MONITORED');
    expect(data.assessment.decision).toBe('STEP_UP_REQUIRED');
  });

  it('POST /api/device-posture/quarantine — deve rejeitar chamada sem deviceId ou reason com HTTP 400', async () => {
    const res = await adminRequest('/api/device-posture/quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('obrigatórios');
  });

  it('POST /api/device-posture/quarantine — deve colocar terminal em quarentena administrativa imediata', async () => {
    const res = await adminRequest('/api/device-posture/quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_titular_dell_win_02',
        reason: 'Suspeita de invasão lateral detectada em telemetria do EDR.'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.device.isQuarantined).toBe(true);
    expect(data.device.quarantineReason).toContain('Suspeita de invasão');
    expect(data.device.latestDecision).toBe('BLOCKED_QUARANTINED');
  });

  it('POST /api/device-posture/release-quarantine — deve rejeitar liberação sem parecer dpoNotes com HTTP 400', async () => {
    const res = await adminRequest('/api/device-posture/release-quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_titular_dell_win_02'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/device-posture/release-quarantine — deve liberar terminal da quarentena após parecer técnico', async () => {
    const res = await adminRequest('/api/device-posture/release-quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'dev_titular_dell_win_02',
        dpoNotes: 'Auditoria pericial concluída. Terminal formatado, BitLocker ativado e certificado renovado.'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.device.isQuarantined).toBe(false);
    expect(data.device.quarantineReason).toBeUndefined();
  });

  it('POST /api/device-posture/update-policy — deve atualizar a política ativa Zero Trust', async () => {
    const res = await adminRequest('/api/device-posture/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: 'READ_ONLY_DEGRADATION',
        reason: 'Modo de contenção preventiva temporária durante fiscalização CRP.'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.policy).toBe('READ_ONLY_DEGRADATION');

    // Restaura a política para STRICT_BLOCK
    await adminRequest('/api/device-posture/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: 'STRICT_BLOCK',
        reason: 'Restauração da política padrão de alta segurança.'
      })
    });
  });

  it('POST /api/device-posture/verify-seal — deve rejeitar requisição sem sealToken com HTTP 400', async () => {
    const res = await adminRequest('/api/device-posture/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/device-posture/verify-seal — deve atestar fé pública e integridade matemática de selo emitido', async () => {
    expect(sampleSealToken).toBeDefined();
    expect(sampleSealToken.length).toBeGreaterThan(10);

    const res = await adminRequest('/api/device-posture/verify-seal', {
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
    expect(data.seal.token).toBe(sampleSealToken);
    expect(data.message).toContain('autêntico');
  });
});
