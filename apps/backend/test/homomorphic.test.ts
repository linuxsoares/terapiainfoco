import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import { HomomorphicService } from '../src/services/homomorphicService';

describe('Rotas de Cifragem Homomórfica Parcial (PHE - Paillier Cryptosystem)', () => {
  const service = HomomorphicService.getInstance();
  const activePrivateKey = service.getActivePrivateKey();

  it('GET /api/homomorphic/overview deve retornar visão geral e métricas de agregação', async () => {
    const res = await app.request('/api/homomorphic/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalCohorts).toBeGreaterThanOrEqual(2);
    expect(data.overview.activePublicKey.bitLength).toBe(512);
    expect(data.overview.availableCidCatalog.length).toBe(9);
  });

  it('GET /api/homomorphic/catalog deve retornar catálogo canônico de 9 diagnósticos CID-11', async () => {
    const res = await app.request('/api/homomorphic/catalog');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.catalog)).toBe(true);
    expect(data.catalog.length).toBe(9);
    expect(data.catalog.some((item: any) => item.code === '6A70')).toBe(true);
  });

  it('GET /api/homomorphic/public-key deve retornar chave pública Paillier ativa', async () => {
    const res = await app.request('/api/homomorphic/public-key');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.publicKey.n).toBeDefined();
    expect(data.publicKey.g).toBeDefined();
    expect(data.publicKey.n2).toBeDefined();
  });

  it('POST /api/homomorphic/cohorts deve criar nova coorte epidemiológica', async () => {
    const res = await app.request('/api/homomorphic/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cohortName: 'Coorte Integrada de Transtornos de Ansiedade - Distrito Federal',
        patientBlindIndexes: []
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cohort.cohortId).toBeDefined();
    expect(data.cohort.cohortName).toBe('Coorte Integrada de Transtornos de Ansiedade - Distrito Federal');
    expect(data.cohort.totalPatients).toBe(0);
    expect(data.cohort.proofSealToken).toMatch(/^phe_seal_v1_/);
  });

  it('POST /api/homomorphic/cohorts/:id/patients deve adicionar paciente com diagnósticos e somar homomorficamente', async () => {
    const res = await app.request('/api/homomorphic/cohorts/cohort_telepsico_sp_2026/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagnosesCidCodes: ['6A70', '6B00', 'MB40']
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cohort.totalPatients).toBeGreaterThanOrEqual(4);
    expect(data.cohort.proofSealToken).toBeDefined();
  });

  it('POST /api/homomorphic/cohorts/decrypt deve decifrar agregados com aprovação do CEP/CONEP', async () => {
    const res = await app.request('/api/homomorphic/cohorts/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cohortId: 'cohort_telepsico_sp_2026',
        authorizedBy: 'DPO_RESPONSAVEL_TECNICO',
        ethicsApprovalCode: 'PARECER_CONEP_2026_BR_091',
        privateKeyLambda: activePrivateKey.lambda,
        privateKeyMu: activePrivateKey.mu
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.decryptedResult).toBeDefined();
    expect(data.decryptedResult.ethicsApprovalCode).toBe('PARECER_CONEP_2026_BR_091');
    expect(Array.isArray(data.decryptedResult.results)).toBe(true);

    const dep = data.decryptedResult.results.find((r: any) => r.code === '6A70');
    expect(dep).toBeDefined();
    expect(dep.count).toBeGreaterThan(0);
  });

  it('POST /api/homomorphic/cohorts/decrypt deve rejeitar decifragem sem aprovação ética', async () => {
    const res = await app.request('/api/homomorphic/cohorts/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cohortId: 'cohort_telepsico_sp_2026',
        authorizedBy: 'OPERADOR_SEM_PARECER',
        ethicsApprovalCode: '',
        privateKeyLambda: activePrivateKey.lambda,
        privateKeyMu: activePrivateKey.mu
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('aprovação ética');
  });

  it('POST /api/homomorphic/verify-seal deve verificar a autenticidade do selo WORM', async () => {
    const overviewRes = await app.request('/api/homomorphic/overview');
    const overviewData = await overviewRes.json();
    const token = overviewData.overview.cohorts[0].proofSealToken;

    const res = await app.request('/api/homomorphic/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proofSealToken: token
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isValid).toBe(true);
    expect(data.seal).toBeDefined();
  });
});
