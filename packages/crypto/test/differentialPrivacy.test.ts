import { describe, it, expect } from 'bun:test';
import {
  sampleLaplaceNoise,
  sampleGaussianNoise,
  calculateGaussianSigma,
  calculateSensitivity,
  clampValue,
  generateSyntheticClinicalCohort,
  computeExactCohortMetric,
  executeDifferentialPrivacyQuery,
  verifyDifferentialPrivacyProof,
  generateEpidemiologicalBenchmark
} from '../src/differentialPrivacy';
import {
  DpMechanism,
  DpQueryType,
  DpCohortMetric
} from '@terapiainfoco/shared';

describe('Differential Privacy Engine — Privacidade Diferencial para Pesquisa Clínica (LGPD Art. 13 & CFP nº 001/2009)', () => {
  it('deve calcular sensibilidade correta para diferentes tipos de consulta epidemiológica', () => {
    const clamping = { lower: 0, upper: 20 };
    const cohortSize = 100;

    // COUNT: sensibilidade 1
    expect(calculateSensitivity(DpQueryType.COUNT, clamping, cohortSize)).toBe(1);

    // HISTOGRAM: sensibilidade 1
    expect(calculateSensitivity(DpQueryType.HISTOGRAM, clamping, cohortSize)).toBe(1);

    // SUM: sensibilidade (upper - lower) = 20
    expect(calculateSensitivity(DpQueryType.SUM, clamping, cohortSize)).toBe(20);

    // MEAN: sensibilidade (upper - lower) / cohortSize = 20 / 100 = 0.2
    expect(calculateSensitivity(DpQueryType.MEAN, clamping, cohortSize)).toBe(0.2);
  });

  it('deve realizar truncamento (clamping) de valores extremos', () => {
    expect(clampValue(25, 0, 21)).toBe(21);
    expect(clampValue(-5, 0, 21)).toBe(0);
    expect(clampValue(10, 0, 21)).toBe(10);
  });

  it('deve gerar ruído de Laplace estocástico com média próxima de zero', () => {
    const scale = 2.0;
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) {
      samples.push(sampleLaplaceNoise(scale));
    }

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Média de Laplace(0, b) deve oscilar perto de zero (|mean| < 0.8 com alta probabilidade)
    expect(Math.abs(mean)).toBeLessThan(0.8);
    // Nem todos os valores devem ser idênticos
    const distinct = new Set(samples.map(s => s.toFixed(3)));
    expect(distinct.size).toBeGreaterThan(100);
  });

  it('deve calcular sigma Gaussiano e gerar ruído com relaxamento delta', () => {
    const sensitivity = 1.0;
    const epsilon = 0.5;
    const delta = 1e-5;

    const sigma = calculateGaussianSigma(sensitivity, epsilon, delta);
    expect(sigma).toBeGreaterThan(0);

    const noise = sampleGaussianNoise(sigma);
    expect(typeof noise).toBe('number');
    expect(Number.isFinite(noise)).toBe(true);
  });

  it('deve computar métrica exata no enclave sobre coorte clínica sintética', () => {
    const cohort = generateSyntheticClinicalCohort();
    expect(cohort.length).toBe(200);

    const resCount = computeExactCohortMetric(
      cohort,
      DpCohortMetric.GAD7_SEVERITY_SCORE,
      DpQueryType.COUNT,
      { lower: 0, upper: 21 }
    );
    expect(resCount.exactValue).toBe(200);
    expect(resCount.sampleSize).toBe(200);

    const resDist = computeExactCohortMetric(
      cohort,
      DpCohortMetric.DIAGNOSIS_DISTRIBUTION,
      DpQueryType.HISTOGRAM,
      { lower: 0, upper: 100 }
    );
    expect(typeof resDist.exactValue).toBe('object');
    const dist = resDist.exactValue as Record<string, number>;
    expect(dist['6B00'] + dist['6A70'] + dist['QD85'] + dist['6B40']).toBe(200);
  });

  it('deve executar consulta com mecanismo de Laplace e proteger o resultado com ruído diferencial', () => {
    const cohort = generateSyntheticClinicalCohort();
    const query = executeDifferentialPrivacyQuery(cohort, {
      projectId: 'proj-ufmg-epidemiology-2026',
      metric: DpCohortMetric.GAD7_SEVERITY_SCORE,
      queryType: DpQueryType.MEAN,
      epsilon: 0.5,
      mechanism: DpMechanism.LAPLACE
    });

    expect(query.queryId).toStartWith('dpq_');
    expect(query.projectId).toBe('proj-ufmg-epidemiology-2026');
    expect(query.mechanism).toBe(DpMechanism.LAPLACE);
    expect(query.epsilonUsed).toBe(0.5);
    expect(typeof query.noisyProtectedValue).toBe('number');
    expect(typeof query.rawExactValue).toBe('number');
    expect(query.exactValueSha256).toHaveLength(64);
    expect(query.privacyGuarantee).toContain('bounded differential likelihood ratio');
    expect(query.proofSeal).toStartWith('dp_v1_');
  });

  it('deve executar consulta com histograma protegido por Privacidade Diferencial', () => {
    const cohort = generateSyntheticClinicalCohort();
    const query = executeDifferentialPrivacyQuery(cohort, {
      projectId: 'proj-fio-cruz-2026',
      metric: DpCohortMetric.DIAGNOSIS_DISTRIBUTION,
      queryType: DpQueryType.HISTOGRAM,
      epsilon: 0.8,
      mechanism: DpMechanism.LAPLACE
    });

    expect(typeof query.noisyProtectedValue).toBe('object');
    const noisyDist = query.noisyProtectedValue as Record<string, number>;
    expect(noisyDist['6B00']).toBeGreaterThanOrEqual(0);
    expect(noisyDist['6A70']).toBeGreaterThanOrEqual(0);
    expect(noisyDist['QD85']).toBeGreaterThanOrEqual(0);
    expect(noisyDist['6B40']).toBeGreaterThanOrEqual(0);
  });

  it('deve verificar autenticidade de selo probatório íntegro via verifyDifferentialPrivacyProof', () => {
    const cohort = generateSyntheticClinicalCohort();
    const query = executeDifferentialPrivacyQuery(cohort, {
      projectId: 'proj-unicamp-remission-2026',
      metric: DpCohortMetric.REMISSION_DURATION_SESSIONS,
      queryType: DpQueryType.MEAN,
      epsilon: 1.0,
      mechanism: DpMechanism.LAPLACE
    });

    const verification = verifyDifferentialPrivacyProof(query.proofSeal, query);
    expect(verification.isValid).toBe(true);
    expect(verification.queryId).toBe(query.queryId);
    expect(verification.projectId).toBe(query.projectId);
    expect(verification.details).toContain('matematicamente íntegro');
    expect(verification.theoreticalMaxDistortion).toBeGreaterThan(0);
  });

  it('deve detectar violação e adulteração caso os parâmetros da consulta sejam alterados retroativamente', () => {
    const cohort = generateSyntheticClinicalCohort();
    const query = executeDifferentialPrivacyQuery(cohort, {
      projectId: 'proj-usp-clinical-2026',
      metric: DpCohortMetric.PHQ9_SEVERITY_SCORE,
      queryType: DpQueryType.MEAN,
      epsilon: 0.5,
      mechanism: DpMechanism.LAPLACE
    });

    // Adulteração maliciosa do resultado protegido
    const tamperedQuery = {
      ...query,
      noisyProtectedValue: (query.noisyProtectedValue as number) + 15.0
    };

    const verification = verifyDifferentialPrivacyProof(query.proofSeal, tamperedQuery);
    expect(verification.isValid).toBe(false);
    expect(verification.details).toContain('Digest canônico SHA-256 divergente');
  });

  it('deve gerar benchmark epidemiológico consolidado de saúde mental com selo probatório', () => {
    const cohort = generateSyntheticClinicalCohort();
    const benchmark = generateEpidemiologicalBenchmark(cohort, 'proj-saude-publica-br-2026', 0.2);

    expect(benchmark.benchmarkId).toStartWith('bmk_');
    expect(benchmark.cohortTotal).toBe(200);
    expect(benchmark.metrics.length).toBe(4);
    expect(benchmark.proofSeal).toStartWith('dp_v1_');

    const remissionMetric = benchmark.metrics.find(m => m.key === 'avg_remission_sessions');
    expect(remissionMetric).toBeDefined();
    expect(remissionMetric!.noisyValue).toBeGreaterThan(0);
    expect(remissionMetric!.unit).toBe('sessões');
  });
});
