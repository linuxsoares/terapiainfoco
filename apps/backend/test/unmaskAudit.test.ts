import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditService } from '../src/services/auditService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

describe('Dynamic Data Masking (DDM) & Revelação Auditada WORM (RFC-001 Opção K & LGPD Art. 11)', () => {
  let therapistToken: string;
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    await globalRateLimitStore.reset();

    // 1. Login com psicóloga titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    therapistToken = (await loginTherapist.json()).accessToken;

    // 2. Login com administrador
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;

    // 3. Login com secretária/recepção
    const loginSec = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    secretaryToken = (await loginSec.json()).accessToken;
  });

  it('deve registrar com sucesso a revelação pontual de CPF de paciente pelo Psicólogo Titular', async () => {
    const res = await app.request('/api/audit/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        resourceType: AuditResourceType.PATIENT,
        resourceId: 'patient-001',
        fieldName: 'cpf',
        reason: 'Conferência presencial de documento'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe(AuditAction.DECRYPT_READ);
    expect(body.resourceType).toBe(AuditResourceType.PATIENT);
    expect(body.resourceId).toBe('patient-001');
    expect(body.fieldName).toBe('cpf');
    expect(body.autoHideSeconds).toBe(30);

    // Valida que foi registrado na hash-chain WORM
    const logs = AuditService.getLogsForResource('patient-001');
    expect(logs.length).toBeGreaterThan(0);
    const lastLog = logs[logs.length - 1];
    expect(lastLog.action).toBe(AuditAction.DECRYPT_READ);
    expect(lastLog.hash).toBeDefined();

    // Valida que a integridade da cadeia continua íntegra
    const integrity = AuditService.verifyChainIntegrity();
    expect(integrity.isValid).toBe(true);
  });

  it('deve registrar a revelação de anotação clínica de prontuário (SOAP) e manter cadeia íntegra', async () => {
    const res = await app.request('/api/audit/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        resourceType: AuditResourceType.CLINICAL_RECORD,
        resourceId: 'record-001',
        fieldName: 'soap_subjective',
        reason: 'Revisão clínica da evolução'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resourceType).toBe(AuditResourceType.CLINICAL_RECORD);
    expect(body.fieldName).toBe('soap_subjective');

    const integrity = AuditService.verifyChainIntegrity();
    expect(integrity.isValid).toBe(true);
  });

  it('deve bloquear perfil de Recepção/Secretária ao tentar revelar prontuário clínico (403 Forbidden)', async () => {
    const res = await app.request('/api/audit/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({
        resourceType: AuditResourceType.CLINICAL_RECORD,
        resourceId: 'record-001',
        fieldName: 'soap_assessment'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Acesso negado: Perfil de recepção/secretária não possui privilégio clínico');
  });

  it('deve permitir que perfil de Recepção/Secretária revele dados cadastrais de paciente (PATIENT) com auditoria', async () => {
    const res = await app.request('/api/audit/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({
        resourceType: AuditResourceType.PATIENT,
        resourceId: 'patient-002',
        fieldName: 'phone',
        reason: 'Confirmação de contato telefônico'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resourceType).toBe(AuditResourceType.PATIENT);
    expect(body.fieldName).toBe('phone');
  });

  it('deve rejeitar requisição com parâmetros obrigatórios ausentes (400 Bad Request)', async () => {
    const res = await app.request('/api/audit/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        resourceType: AuditResourceType.PATIENT
        // fieldName e resourceId ausentes
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('obrigatórios');
  });
});
