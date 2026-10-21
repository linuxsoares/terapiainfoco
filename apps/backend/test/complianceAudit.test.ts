import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditAction } from '@terapiainfoco/shared';

describe('Auditoria Contínua, Pentest Automatizado & Relatório RIPD/DPIA (Fase 4 do RFC-001 & LGPD Art. 38/50)', () => {
  let adminToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    await globalRateLimitStore.reset();

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

    const loginSecretary = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secretaryData = await loginSecretary.json();
    secretaryToken = secretaryData.accessToken;
  });

  it('deve executar o pentest automatizado e gerar o relatório RIPD/DPIA com score 100% e hash canônico', async () => {
    const res = await app.request('/api/audit/compliance/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toBeDefined();

    const report = body.report;
    expect(report.reportId).toBeDefined();
    expect(report.overallScore).toBe(100);
    expect(report.complianceStatus).toBe('FULL_COMPLIANCE');
    expect(report.pentestSummary.totalScenarios).toBe(6);
    expect(report.pentestSummary.passed).toBe(6);
    expect(report.pentestSummary.failed).toBe(0);

    // Valida cenários de pentest
    expect(report.scenarios).toHaveLength(6);
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-01-RBAC-BYPASS');
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-02-BRUTE-FORCE-RATE-LIMIT');
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-03-WEBHOOK-PAYLOAD-TAMPERING');
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-04-WORM-CHAIN-INTEGRITY');
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-05-WEBAUTHN-REPLAY-ATTACK');
    expect(report.scenarios.map((s: any) => s.scenarioId)).toContain('PENTEST-06-FLE-TAMPERING-AUTH-TAG');

    // Valida salvaguardas LGPD e CFP
    expect(report.lgpdArticles.length).toBeGreaterThanOrEqual(9);
    expect(report.cfpResolutions.length).toBeGreaterThanOrEqual(4);

    // Valida selo probatório (hash canônico SHA-256 de 64 caracteres)
    expect(report.canonicalHash).toBeDefined();
    expect(report.canonicalHash).toHaveLength(64);

    // Valida que a execução foi registrada na trilha WORM
    const complianceLogs = db.auditLogs.filter(l => l.action === AuditAction.COMPLIANCE_AUDIT_RUN);
    expect(complianceLogs.length).toBeGreaterThanOrEqual(1);
    expect(complianceLogs[0].resourceId).toBe(report.reportId);
  });

  it('deve consultar o relatório mais recente de conformidade em GET /api/audit/compliance/report', async () => {
    // Primeiro executa o relatório
    await app.request('/api/audit/compliance/run', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const res = await app.request('/api/audit/compliance/report', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toBeDefined();
    expect(body.report.overallScore).toBe(100);
  });

  it('deve realizar download do relatório RIPD com cabeçalho Content-Disposition adequado', async () => {
    const res = await app.request('/api/audit/compliance/download-ripd', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="terapiainfoco-ripd-dpia-');
    const body = await res.json();
    expect(body.canonicalHash).toHaveLength(64);
  });

  it('deve rejeitar acesso não autenticado com HTTP 401', async () => {
    const res = await app.request('/api/audit/compliance/run', {
      method: 'POST',
      headers: {
        'X-Strict-Auth': 'true'
      }
    });

    expect(res.status).toBe(401);
  });

  it('deve aplicar controle RBAC estrito e rejeitar perfil de recepção/secretária com HTTP 403 Forbidden', async () => {
    const res = await app.request('/api/audit/compliance/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretaryToken}`
      }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Acesso negado');
  });
});
