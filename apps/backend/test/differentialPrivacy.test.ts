import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { dpRouter } from '../src/routes/differentialPrivacy';
import { DifferentialPrivacyService } from '../src/services/differentialPrivacyService';
import {
  DpMechanism,
  DpQueryType,
  DpCohortMetric,
  DpBudgetStatus
} from '@terapiainfoco/shared';

describe('Backend API — Rotas de Privacidade Diferencial (ε-DP) para Pesquisa Clínica (LGPD Art. 13 & CFP nº 001/2009)', () => {
  let app: Hono;
  let service: DifferentialPrivacyService;

  beforeEach(() => {
    service = DifferentialPrivacyService.getInstance();
    service.resetState();
    app = new Hono();
    app.route('/api/differential-privacy', dpRouter);
  });

  it('GET /api/differential-privacy/overview — deve retornar governança executiva e métricas de DP', async () => {
    const res = await app.request('/api/differential-privacy/overview');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.overview).toBeDefined();
    expect(json.overview.totalResearchProjects).toBeGreaterThanOrEqual(2);
    expect(json.overview.aggregateEpsilonBudget).toBeGreaterThan(0);
    expect(json.overview.privacyBudgetHealth).toBe(DpBudgetStatus.HEALTHY);
    expect(Array.isArray(json.overview.recentQueries)).toBe(true);
  });

  it('GET /api/differential-privacy/projects — deve listar projetos de pesquisa homologados', async () => {
    const res = await app.request('/api/differential-privacy/projects');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.total).toBeGreaterThanOrEqual(2);
    expect(json.projects[0].projectId).toBeDefined();
    expect(json.projects[0].cepProtocol).toContain('CEP-');
  });

  it('POST /api/differential-privacy/query — deve executar consulta com Laplace, debitar cota e gerar selo WORM', async () => {
    const res = await app.request('/api/differential-privacy/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-ufmg-tcc-2026',
        metric: DpCohortMetric.GAD7_SEVERITY_SCORE,
        queryType: DpQueryType.MEAN,
        epsilon: 0.5,
        mechanism: DpMechanism.LAPLACE
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result).toBeDefined();
    expect(json.result.queryId).toStartWith('dpq_');
    expect(json.result.proofSeal).toStartWith('dp_v1_');
    expect(typeof json.result.noisyProtectedValue).toBe('number');
    expect(json.remainingBudget).toBeLessThan(2.2);
    expect(json.budgetStatus).toBe(DpBudgetStatus.HEALTHY);
  });

  it('POST /api/differential-privacy/query — deve bloquear consulta quando orçamento for excedido', async () => {
    // Projeto proj-fiocruz-burnout-2026 tem 0.3 de orçamento restante
    const res = await app.request('/api/differential-privacy/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-fiocruz-burnout-2026',
        metric: DpCohortMetric.REMISSION_DURATION_SESSIONS,
        queryType: DpQueryType.MEAN,
        epsilon: 1.5, // Excede o saldo disponível de 0.3
        mechanism: DpMechanism.LAPLACE
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toContain('Orçamento de privacidade esgotado');
  });

  it('POST /api/differential-privacy/benchmark — deve consolidar benchmark epidemiológico multicêntrico', async () => {
    const res = await app.request('/api/differential-privacy/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-ufmg-tcc-2026',
        benchmarkType: 'CLINICAL_OUTCOMES',
        epsilonPerMetric: 0.2,
        mechanism: DpMechanism.LAPLACE
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.benchmark).toBeDefined();
    expect(json.benchmark.benchmarkId).toStartWith('bmk_');
    expect(json.benchmark.metrics.length).toBe(4);
    expect(json.benchmark.proofSeal).toStartWith('dp_v1_');
  });

  it('POST /api/differential-privacy/verify-proof — deve atestar veracidade de selo notarial válido', async () => {
    // 1. Executa consulta para obter selo
    const queryRes = await app.request('/api/differential-privacy/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-ufmg-tcc-2026',
        metric: DpCohortMetric.PHQ9_SEVERITY_SCORE,
        queryType: DpQueryType.MEAN,
        epsilon: 0.3,
        mechanism: DpMechanism.LAPLACE
      })
    });

    const queryJson = await queryRes.json();
    const seal = queryJson.result.proofSeal;

    // 2. Verifica selo
    const verifyRes = await app.request('/api/differential-privacy/verify-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofSeal: seal })
    });

    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.verification.isValid).toBe(true);
    expect(verifyJson.verification.proofSeal).toBe(seal);
  });

  it('POST /api/differential-privacy/allocate-budget — deve permitir que DPO aloque novo orçamento para projeto', async () => {
    const res = await app.request('/api/differential-privacy/allocate-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-usp-psicometria-2026',
        title: 'Estudo Psicométrico Longitudinal de Escalas Clínicas em Psicoterapia',
        researcherName: 'Dr. Eduardo Siqueira',
        institution: 'Universidade de São Paulo (USP)',
        cepProtocol: 'CEP-USP-2026-9011',
        purpose: 'Avaliação psicométrica de normas brasileiras para PHQ-9 e GAD-7.',
        epsilonBudget: 2.5,
        dpoApprover: 'dpo@terapiainfoco.com.br'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.project.projectId).toBe('proj-usp-psicometria-2026');
    expect(json.project.totalEpsilonBudget).toBe(2.5);
    expect(json.project.remainingEpsilonBudget).toBe(2.5);
    expect(json.project.status).toBe('ACTIVE');
  });
});
