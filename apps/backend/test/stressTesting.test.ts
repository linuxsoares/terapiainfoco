import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { StressScenario, SloStatus, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../src/db/memoryDb';

describe('Homologação sob Carga, Stress Concorrente & Avaliação de SLOs RED (RFC §5.1, §5.2)', () => {
  let adminToken: string;
  let receptionistToken: string;

  beforeEach(async () => {
    globalRateLimitStore.reset();

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

  it('deve barrar acesso de anônimos com 401 e perfis não-ADMIN com 403', async () => {
    const unauth = await app.request('/api/system/stress/history');
    expect(unauth.status).toBe(401);

    const forbidden = await app.request('/api/system/stress/history', {
      headers: { Authorization: `Bearer ${receptionistToken}` }
    });
    expect(forbidden.status).toBe(403);
  });

  it('deve retornar a definição dos 4 SLOs contratuais de engenharia (RFC §5.1 / §5.2)', async () => {
    const res = await app.request('/api/system/stress/slos', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.slos)).toBe(true);
    expect(data.slos.length).toBe(4);

    const sloIds = data.slos.map((s: any) => s.id);
    expect(sloIds).toContain('SLO-RED-01');
    expect(sloIds).toContain('SLO-RED-02');
    expect(sloIds).toContain('SLO-RED-03');
    expect(sloIds).toContain('SLO-RED-04');
  });

  it('deve retornar o histórico de relatórios de stress e percentis RED baseline', async () => {
    const res = await app.request('/api/system/stress/history', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.reports)).toBe(true);
    expect(data.reports.length).toBeGreaterThanOrEqual(1);

    const first = data.reports[0];
    expect(first.percentiles).toBeDefined();
    expect(first.percentiles.p50).toBeGreaterThanOrEqual(0);
    expect(first.percentiles.p99).toBeGreaterThanOrEqual(0);
    expect(first.rps).toBeGreaterThan(0);
  });

  it('deve executar teste de carga no cenário READ_CONCURRENCY com cálculo de percentis e auditoria WORM', async () => {
    const res = await app.request('/api/system/stress/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        scenario: StressScenario.READ_CONCURRENCY,
        totalRequests: 40,
        concurrency: 10
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.report).toBeDefined();

    const report = data.report;
    expect(report.scenario).toBe(StressScenario.READ_CONCURRENCY);
    expect(report.totalRequests).toBe(40);
    expect(report.successfulRequests).toBe(40);
    expect(report.failedRequests).toBe(0);
    expect(report.errorRate).toBe(0);
    expect(report.rps).toBeGreaterThan(0);

    // Percentis RED estatísticos
    expect(report.percentiles.min).toBeGreaterThanOrEqual(0);
    expect(report.percentiles.p50).toBeGreaterThanOrEqual(0);
    expect(report.percentiles.p90).toBeGreaterThanOrEqual(report.percentiles.p50);
    expect(report.percentiles.p99).toBeGreaterThanOrEqual(report.percentiles.p90);
    expect(report.percentiles.p99).toBeLessThan(200); // Cumpre SLO de 200ms

    // Avaliação dos SLOs
    expect(report.slos.length).toBe(4);
    const sloRead = report.slos.find((s: any) => s.id === 'SLO-RED-01');
    expect(sloRead?.status).toBe(SloStatus.MET);

    // Verifica auditoria WORM
    const stressAudit = db.auditLogs.find(l => l.action === 'STRESS_TEST_RUN');
    expect(stressAudit).toBeDefined();
    expect(stressAudit?.resourceType).toBe(AuditResourceType.BENCHMARK);
  });

  it('deve executar teste de stress no cenário CRYPTO_ENVELOPE_STRESS sob Envelope Encryption', async () => {
    const res = await app.request('/api/system/stress/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        scenario: StressScenario.CRYPTO_ENVELOPE_STRESS,
        totalRequests: 30,
        concurrency: 10
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    const report = data.report;

    expect(report.successfulRequests).toBe(30);
    expect(report.errorRate).toBe(0);
    expect(report.percentiles.p99).toBeLessThan(500); // Cumpre SLO de 500ms para Envelope KMS
  });

  it('deve executar teste de estresse WORM_LEDGER_STRESS e certificar 100% de integridade da Hash-Chain', async () => {
    const res = await app.request('/api/system/stress/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        scenario: StressScenario.WORM_LEDGER_STRESS,
        totalRequests: 25,
        concurrency: 5
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const sloWorm = data.report.slos.find((s: any) => s.id === 'SLO-RED-04');
    expect(sloWorm?.actualValue).toBe(100);
    expect(sloWorm?.status).toBe(SloStatus.MET);
  });
});
