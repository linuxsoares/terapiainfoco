import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { UserRole, KmsKeyStatus } from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';

describe('Gestão de Chaves KMS & Rotação Contínua (NIST SP 800-57 & RFC §4.2)', () => {
  let adminToken: string;
  let receptionistToken: string;

  beforeEach(async () => {
    globalRateLimitStore.reset();

    // Gera token de Admin para acesso às operações de governança criptográfica
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    // Gera token de Recepção (não autorizado para KMS)
    const loginRecep = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const recepData = await loginRecep.json();
    receptionistToken = recepData.accessToken;
  });

  it('deve barrar acesso não autenticado com 401 e perfis não-ADMIN com 403', async () => {
    // Sem token
    const resUnauth = await app.request('/api/kms/status');
    expect(resUnauth.status).toBe(401);

    // Com token de recepção
    const resForbidden = await app.request('/api/kms/status', {
      headers: { Authorization: `Bearer ${receptionistToken}` }
    });
    expect(resForbidden.status).toBe(403);
  });

  it('deve retornar status do KMS, chaves ativas, conformidade NIST e política agendada', async () => {
    const res = await app.request('/api/kms/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBeDefined();
    expect(data.status.activeKeyVersion).toBeGreaterThanOrEqual(1);
    expect(data.status.totalKeysCount).toBeGreaterThanOrEqual(1);
    expect(data.status.policy.enabled).toBe(true);
    expect(data.status.nistCompliance).toBe(true);
    expect(data.status.complianceScore).toBe(100);
    expect(Array.isArray(data.status.keys)).toBe(true);
  });

  it('deve rotacionar Master Key KEK para uma nova versão e auditar na trilha WORM', async () => {
    const initialStatusRes = await app.request('/api/kms/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const initialStatus = await initialStatusRes.json();
    const prevVersion = initialStatus.status.activeKeyVersion;

    const rotateRes = await app.request('/api/kms/rotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Rotação programada trimestral NIST SP 800-57',
        reWrapExisting: true
      })
    });

    expect(rotateRes.status).toBe(200);
    const rotateData = await rotateRes.json();
    expect(rotateData.success).toBe(true);
    expect(rotateData.newKey.version).toBe(prevVersion + 1);
    expect(rotateData.newKey.status).toBe(KmsKeyStatus.ACTIVE);
    expect(rotateData.previousKey.status).toBe(KmsKeyStatus.ROTATED);

    // Verifica presença na trilha WORM
    const rotatedLog = db.auditLogs.find(l => l.action === 'KMS_KEY_ROTATED');
    expect(rotatedLog).toBeDefined();
    expect(rotatedLog?.resourceType).toBe('KMS');
  });

  it('deve executar re-wrapping de DEKs legadas com registro na auditoria WORM', async () => {
    const reWrapRes = await app.request('/api/kms/re-wrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({})
    });

    expect(reWrapRes.status).toBe(200);
    const reWrapData = await reWrapRes.json();
    expect(reWrapData.success).toBe(true);
    expect(reWrapData.totalExamined).toBeGreaterThanOrEqual(1);

    // Verifica auditoria WORM
    const lastLog = db.auditLogs.find(l => l.action === 'KMS_KEY_RE_WRAPPED');
    expect(lastLog).toBeDefined();
  });

  it('deve atualizar política de rotação automática e registrar auditoria', async () => {
    const policyRes = await app.request('/api/kms/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        enabled: true,
        intervalDays: 180,
        autoReWrapLegacyDeks: true,
        alertThresholdDays: 30
      })
    });

    expect(policyRes.status).toBe(200);
    const policyData = await policyRes.json();
    expect(policyData.success).toBe(true);
    expect(policyData.policy.intervalDays).toBe(180);
    expect(policyData.policy.alertThresholdDays).toBe(30);

    // Verifica auditoria WORM
    const policyLog = db.auditLogs.find(l => l.action === 'KMS_POLICY_UPDATED');
    expect(policyLog).toBeDefined();
  });

  it('deve bloquear revogação da chave ativa atual e permitir revogação de chave rotacionada', async () => {
    const statusRes = await app.request('/api/kms/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const status = await statusRes.json();
    const activeVer = status.status.activeKeyVersion;

    // Tentar revogar a versão ativa atual deve ser rejeitado (HTTP 400)
    const revokeActiveRes = await app.request(`/api/kms/revoke/${activeVer}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Tentativa indevida' })
    });
    expect(revokeActiveRes.status).toBe(400);

    // Revogar a versão 1 (que já foi rotacionada no teste anterior)
    const revokeV1Res = await app.request('/api/kms/revoke/1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Chave legada descontinuada' })
    });

    expect(revokeV1Res.status).toBe(200);
    const revokeData = await revokeV1Res.json();
    expect(revokeData.success).toBe(true);
    expect(revokeData.key.status).toBe(KmsKeyStatus.REVOKED);

    const revokeLog = db.auditLogs.find(l => l.action === 'KMS_KEY_REVOKED');
    expect(revokeLog).toBeDefined();
  });
});
