/**
 * Core Criptográfico de Privacidade Diferencial (Differential Privacy - ε-DP)
 * Plataforma TerapiaInFoco — RFC-001 §4.4, LGPD Art. 13 & Resolução CFP nº 001/2009
 *
 * Implementa garantias matemáticas estritas de anonimização para pesquisa clínica e
 * epidemiológica através dos Mecanismos de Laplace (Pure ε-DP) e Gaussiano ((ε, δ)-DP),
 * clamping compulsório de sensibilidade, selo notarial WORM JCS (RFC 8785) e auditoria anti-tampering.
 */

import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  DpMechanism,
  DpQueryType,
  DpCohortMetric,
  DpBudgetStatus,
  DpResearchStatus
} from '@terapiainfoco/shared';
import type {
  DpResearchProject,
  DpQueryResult,
  DpProofVerification,
  DpEpidemiologicalBenchmark
} from '@terapiainfoco/shared';

const DEFAULT_SECRET_SALT = process.env.DP_NOTARY_SECRET || 'terapiainfoco_dp_differential_privacy_worm_salt_2026';

/**
 * Registro de Paciente Sintético para Pesquisa Clínica e Benchmarks Epidemiológicos
 */
export interface SyntheticClinicalPatient {
  id: string;
  age: number;
  gender: 'FEMININO' | 'MASCULINO' | 'OUTRO';
  diagnosisCid11: string; // Ex: '6B00' (Ansiedade Generalizada), '6A70' (Episódio Depressivo), 'QD85' (Burnout), '6B40' (TEPT)
  gad7Score: number;      // 0 a 21
  phq9Score: number;      // 0 a 27
  sessionsCount: number;  // 1 a 60
  clinicalOutcome: 'REMISSION' | 'IMPROVEMENT' | 'STABLE' | 'DROPOUT';
}

/**
 * Gera valor uniforme aleatório no intervalo aberto (0, 1) usando entropia CSPRNG
 */
export function sampleSecureUniform(): number {
  let u = 0;
  while (u === 0 || u === 1) {
    const buf = randomBytes(4);
    u = buf.readUInt32BE(0) / 0x100000000;
  }
  return u;
}

/**
 * Amostra de ruído de Laplace usando o método de inversão da CDF com gerador criptograficamente seguro.
 * Distribuição: Lap(0, b) onde b = sensibilidade / epsilon.
 */
export function sampleLaplaceNoise(scale: number): number {
  if (scale <= 0) return 0;
  // u uniforme em (-0.5, 0.5)
  const u = sampleSecureUniform() - 0.5;
  const sgn = u < 0 ? -1 : 1;
  return -scale * sgn * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Calcula o desvio padrão (sigma) para o Mecanismo Gaussiano ((ε, δ)-DP)
 * sigma = (Δf * sqrt(2 * ln(1.25 / delta))) / epsilon
 */
export function calculateGaussianSigma(sensitivity: number, epsilon: number, delta: number): number {
  if (epsilon <= 0 || delta <= 0 || delta >= 1) {
    throw new Error('Parâmetros de privacidade inválidos para mecanismo Gaussiano (epsilon > 0 e 0 < delta < 1).');
  }
  return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
}

/**
 * Amostra de ruído Gaussiano Normal N(0, sigma^2) via Box-Muller transform
 */
export function sampleGaussianNoise(sigma: number): number {
  if (sigma <= 0) return 0;
  const u1 = sampleSecureUniform();
  const u2 = sampleSecureUniform();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * sigma;
}

/**
 * Truncamento (clamping) de valores extremos para limitar formalmente a sensibilidade local
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calcula a sensibilidade global (L1) da consulta epidemiológica
 */
export function calculateSensitivity(
  queryType: DpQueryType,
  clampingBounds: { lower: number; upper: number },
  cohortSize: number
): number {
  const range = Math.max(1, clampingBounds.upper - clampingBounds.lower);
  switch (queryType) {
    case DpQueryType.COUNT:
    case DpQueryType.HISTOGRAM:
      return 1; // Adicionar ou remover um paciente altera a contagem em no máximo 1
    case DpQueryType.SUM:
      return range; // Altera no máximo pela amplitude do clamping
    case DpQueryType.MEAN:
      return range / Math.max(1, cohortSize); // Média dividida pelo tamanho amostral
    default:
      return 1;
  }
}

/**
 * Canonicalização JSON determinística (RFC 8785 JCS)
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Gera uma coorte clínica padrão sintética (200 pacientes) para análises epidemiológicas
 */
export function generateSyntheticClinicalCohort(): SyntheticClinicalPatient[] {
  const diagnoses = ['6B00', '6A70', 'QD85', '6B40']; // Ansiedade, Depressão, Burnout, TEPT
  const genders: Array<'FEMININO' | 'MASCULINO' | 'OUTRO'> = ['FEMININO', 'MASCULINO', 'OUTRO'];
  const outcomes: Array<'REMISSION' | 'IMPROVEMENT' | 'STABLE' | 'DROPOUT'> = ['REMISSION', 'IMPROVEMENT', 'STABLE', 'DROPOUT'];

  const patients: SyntheticClinicalPatient[] = [];

  for (let i = 1; i <= 200; i++) {
    // Semente determinística sintética variada
    const diag = diagnoses[i % diagnoses.length];
    const gen = genders[i % genders.length];
    const age = 18 + ((i * 7) % 55); // 18 a 72 anos
    const gad7 = Math.min(21, Math.max(0, 4 + ((i * 3) % 18)));
    const phq9 = Math.min(27, Math.max(0, 3 + ((i * 4) % 24)));
    const sessions = 4 + ((i * 5) % 45); // 4 a 48 sessões
    const outcome = outcomes[i % outcomes.length];

    patients.push({
      id: `pt-synth-${i.toString().padStart(4, '0')}`,
      age,
      gender: gen,
      diagnosisCid11: diag,
      gad7Score: gad7,
      phq9Score: phq9,
      sessionsCount: sessions,
      clinicalOutcome: outcome
    });
  }

  return patients;
}

/**
 * Executa agregação estatística direta (exata) sobre a coorte clínica no enclave protegido
 */
export function computeExactCohortMetric(
  cohort: SyntheticClinicalPatient[],
  metric: DpCohortMetric,
  queryType: DpQueryType,
  clampingBounds: { lower: number; upper: number }
): { exactValue: number | Record<string, number>; sampleSize: number } {
  const n = cohort.length;
  if (n === 0) return { exactValue: 0, sampleSize: 0 };

  if (queryType === DpQueryType.HISTOGRAM || metric === DpCohortMetric.DIAGNOSIS_DISTRIBUTION) {
    if (metric === DpCohortMetric.DIAGNOSIS_DISTRIBUTION) {
      const counts: Record<string, number> = { '6B00': 0, '6A70': 0, 'QD85': 0, '6B40': 0 };
      cohort.forEach(p => {
        if (counts[p.diagnosisCid11] !== undefined) counts[p.diagnosisCid11]++;
      });
      return { exactValue: counts, sampleSize: n };
    }

    if (metric === DpCohortMetric.AGE_GROUP_DEMOGRAPHICS) {
      const groups: Record<string, number> = { '18-29': 0, '30-44': 0, '45-59': 0, '60+': 0 };
      cohort.forEach(p => {
        if (p.age < 30) groups['18-29']++;
        else if (p.age < 45) groups['30-44']++;
        else if (p.age < 60) groups['45-59']++;
        else groups['60+']++;
      });
      return { exactValue: groups, sampleSize: n };
    }
  }

  // Agregações numéricas contínuas
  let values: number[] = [];
  if (metric === DpCohortMetric.GAD7_SEVERITY_SCORE) {
    values = cohort.map(p => clampValue(p.gad7Score, clampingBounds.lower, clampingBounds.upper));
  } else if (metric === DpCohortMetric.PHQ9_SEVERITY_SCORE) {
    values = cohort.map(p => clampValue(p.phq9Score, clampingBounds.lower, clampingBounds.upper));
  } else if (metric === DpCohortMetric.REMISSION_DURATION_SESSIONS) {
    values = cohort.map(p => clampValue(p.sessionsCount, clampingBounds.lower, clampingBounds.upper));
  } else {
    values = cohort.map(p => clampValue(p.age, clampingBounds.lower, clampingBounds.upper));
  }

  if (queryType === DpQueryType.COUNT) {
    return { exactValue: values.length, sampleSize: n };
  }

  if (queryType === DpQueryType.SUM) {
    const sum = values.reduce((acc, curr) => acc + curr, 0);
    return { exactValue: Number(sum.toFixed(2)), sampleSize: n };
  }

  // MEAN
  const sum = values.reduce((acc, curr) => acc + curr, 0);
  const mean = sum / Math.max(1, values.length);
  return { exactValue: Number(mean.toFixed(2)), sampleSize: n };
}

/**
 * Aplica ruído com garantia de Privacidade Diferencial e gera prova criptográfica notarial
 */
export function executeDifferentialPrivacyQuery(
  cohort: SyntheticClinicalPatient[],
  params: {
    projectId: string;
    metric: DpCohortMetric;
    queryType: DpQueryType;
    epsilon: number;
    delta?: number;
    mechanism?: DpMechanism;
    clampingLowerBound?: number;
    clampingUpperBound?: number;
  },
  secretSalt = DEFAULT_SECRET_SALT
): DpQueryResult {
  const mechanism = params.mechanism || DpMechanism.LAPLACE;
  const epsilon = Math.max(0.01, params.epsilon);
  const delta = params.delta || 1e-5;

  // Limites de Clamping Padrão por Métrica
  let lower = params.clampingLowerBound ?? 0;
  let upper = params.clampingUpperBound ?? 100;

  if (params.metric === DpCohortMetric.GAD7_SEVERITY_SCORE) {
    lower = params.clampingLowerBound ?? 0;
    upper = params.clampingUpperBound ?? 21;
  } else if (params.metric === DpCohortMetric.PHQ9_SEVERITY_SCORE) {
    lower = params.clampingLowerBound ?? 0;
    upper = params.clampingUpperBound ?? 27;
  } else if (params.metric === DpCohortMetric.REMISSION_DURATION_SESSIONS) {
    lower = params.clampingLowerBound ?? 1;
    upper = params.clampingUpperBound ?? 60;
  } else if (params.metric === DpCohortMetric.AGE_GROUP_DEMOGRAPHICS) {
    lower = 18;
    upper = 90;
  }

  const clampingBounds = { lower, upper };
  const { exactValue, sampleSize } = computeExactCohortMetric(cohort, params.metric, params.queryType, clampingBounds);

  const sensitivity = calculateSensitivity(params.queryType, clampingBounds, sampleSize);
  let noiseScale = 0;
  let noisyProtectedValue: number | Record<string, number>;

  if (typeof exactValue === 'number') {
    if (mechanism === DpMechanism.LAPLACE) {
      noiseScale = sensitivity / epsilon;
      const noise = sampleLaplaceNoise(noiseScale);
      let protectedVal = exactValue + noise;
      if (params.queryType === DpQueryType.COUNT) {
        protectedVal = Math.max(0, Math.round(protectedVal));
      } else {
        protectedVal = Number(Math.max(lower, Math.min(upper * 1.5, protectedVal)).toFixed(2));
      }
      noisyProtectedValue = protectedVal;
    } else {
      // Gaussian
      const sigma = calculateGaussianSigma(sensitivity, epsilon, delta);
      noiseScale = sigma;
      const noise = sampleGaussianNoise(sigma);
      let protectedVal = exactValue + noise;
      if (params.queryType === DpQueryType.COUNT) {
        protectedVal = Math.max(0, Math.round(protectedVal));
      } else {
        protectedVal = Number(Math.max(lower, Math.min(upper * 1.5, protectedVal)).toFixed(2));
      }
      noisyProtectedValue = protectedVal;
    }
  } else {
    // Objeto (ex: Histograma de contagens)
    noiseScale = 1 / epsilon; // Cada bin tem sensibilidade 1
    const noisyMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(exactValue)) {
      const noise = mechanism === DpMechanism.LAPLACE
        ? sampleLaplaceNoise(noiseScale)
        : sampleGaussianNoise(calculateGaussianSigma(1, epsilon, delta));
      noisyMap[k] = Math.max(0, Math.round(v + noise));
    }
    noisyProtectedValue = noisyMap;
  }

  const queryId = `dpq_${randomBytes(8).toString('hex')}`;
  const executedAt = new Date().toISOString();
  const privacyFactor = Math.exp(epsilon).toFixed(3);
  const privacyGuarantee = `e^ε = ${privacyFactor}x bounded differential likelihood ratio (LGPD Art. 13)`;

  // Hash determinístico cego do valor real (preserva prova de integridade no enclave)
  const exactValueSha256 = createHash('sha256')
    .update(canonicalizeJson(exactValue))
    .digest('hex');

  const resultBase: Omit<DpQueryResult, 'proofSeal'> = {
    queryId,
    projectId: params.projectId,
    metric: params.metric,
    queryType: params.queryType,
    mechanism,
    epsilonUsed: epsilon,
    deltaUsed: mechanism === DpMechanism.GAUSSIAN ? delta : undefined,
    clampingBounds,
    sensitivity: Number(sensitivity.toFixed(4)),
    noiseScale: Number(noiseScale.toFixed(4)),
    rawExactValue: exactValue,
    noisyProtectedValue,
    exactValueSha256,
    privacyGuarantee,
    sampleCohortSize: sampleSize,
    executedAt
  };

  const proofSeal = generateDpProofSeal(resultBase, secretSalt);

  return {
    ...resultBase,
    proofSeal
  };
}

/**
 * Gera o Selo Probatório Notarial WORM com Digest Canônico SHA-256 e Assinatura HMAC
 * Formato: dp_v1_<base64url>
 */
export function generateDpProofSeal(
  result: Omit<DpQueryResult, 'proofSeal'>,
  secretSalt = DEFAULT_SECRET_SALT
): string {
  const canonicalObject = {
    clampingBounds: result.clampingBounds,
    deltaUsed: result.deltaUsed ?? null,
    epsilonUsed: result.epsilonUsed,
    exactValueSha256: result.exactValueSha256,
    executedAt: result.executedAt,
    mechanism: result.mechanism,
    metric: result.metric,
    noiseScale: result.noiseScale,
    noisyProtectedValue: result.noisyProtectedValue,
    projectId: result.projectId,
    queryId: result.queryId,
    queryType: result.queryType,
    sampleCohortSize: result.sampleCohortSize,
    sensitivity: result.sensitivity
  };

  const canonicalString = canonicalizeJson(canonicalObject);
  const canonicalHash = createHash('sha256').update(canonicalString).digest('hex');

  const hmacSignature = createHmac('sha256', secretSalt)
    .update(`dp_notary:${result.queryId}:${result.projectId}:${canonicalHash}`)
    .digest('hex');

  const proofPayload = {
    v: 1,
    qid: result.queryId,
    pid: result.projectId,
    eps: result.epsilonUsed,
    mec: result.mechanism,
    cnh: canonicalHash,
    sig: hmacSignature,
    iat: result.executedAt
  };

  const base64Url = Buffer.from(JSON.stringify(proofPayload), 'utf8').toString('base64url');
  return `dp_v1_${base64Url}`;
}

/**
 * Verificação Pericial Matemática do Selo Notarial de Privacidade Diferencial
 */
export function verifyDifferentialPrivacyProof(
  proofSeal: string,
  result: DpQueryResult,
  secretSalt = DEFAULT_SECRET_SALT
): DpProofVerification {
  if (!proofSeal || !proofSeal.startsWith('dp_v1_')) {
    return {
      isValid: false,
      proofSeal: proofSeal || '',
      queryId: result.queryId,
      projectId: result.projectId,
      mechanism: result.mechanism,
      epsilon: result.epsilonUsed,
      theoreticalMaxDistortion: 0,
      verifiedAt: new Date().toISOString(),
      details: 'Selo probatório de Privacidade Diferencial com cabeçalho inválido ou ausente.'
    };
  }

  try {
    const raw = proofSeal.replace('dp_v1_', '');
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));

    if (decoded.v !== 1 || decoded.qid !== result.queryId || decoded.pid !== result.projectId) {
      return {
        isValid: false,
        proofSeal,
        queryId: result.queryId,
        projectId: result.projectId,
        mechanism: result.mechanism,
        epsilon: result.epsilonUsed,
        theoreticalMaxDistortion: 0,
        verifiedAt: new Date().toISOString(),
        details: 'Metadados no selo diferem da consulta auditada (violação de integridade).'
      };
    }

    // Recalcular Digest Canônico SHA-256
    const canonicalObject = {
      clampingBounds: result.clampingBounds,
      deltaUsed: result.deltaUsed ?? null,
      epsilonUsed: result.epsilonUsed,
      exactValueSha256: result.exactValueSha256,
      executedAt: result.executedAt,
      mechanism: result.mechanism,
      metric: result.metric,
      noiseScale: result.noiseScale,
      noisyProtectedValue: result.noisyProtectedValue,
      projectId: result.projectId,
      queryId: result.queryId,
      queryType: result.queryType,
      sampleCohortSize: result.sampleCohortSize,
      sensitivity: result.sensitivity
    };

    const recomputedHash = createHash('sha256')
      .update(canonicalizeJson(canonicalObject))
      .digest('hex');

    if (recomputedHash !== decoded.cnh) {
      return {
        isValid: false,
        proofSeal,
        queryId: result.queryId,
        projectId: result.projectId,
        mechanism: result.mechanism,
        epsilon: result.epsilonUsed,
        theoreticalMaxDistortion: 0,
        verifiedAt: new Date().toISOString(),
        details: 'Digest canônico SHA-256 divergente. Payload de consulta adulterado retroativamente.'
      };
    }

    // Verificar Assinatura HMAC
    const expectedSig = createHmac('sha256', secretSalt)
      .update(`dp_notary:${result.queryId}:${result.projectId}:${recomputedHash}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(decoded.sig, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return {
        isValid: false,
        proofSeal,
        queryId: result.queryId,
        projectId: result.projectId,
        mechanism: result.mechanism,
        epsilon: result.epsilonUsed,
        theoreticalMaxDistortion: 0,
        verifiedAt: new Date().toISOString(),
        details: 'Assinatura criptográfica forjada ou chave de verificação inválida.'
      };
    }

    // Distorção Teórica Máxima (3 desvios de ruído Laplace = 3 * b)
    const maxTheoreticalDistortion = Number((result.noiseScale * 3).toFixed(2));

    return {
      isValid: true,
      proofSeal,
      queryId: result.queryId,
      projectId: result.projectId,
      mechanism: result.mechanism,
      epsilon: result.epsilonUsed,
      theoreticalMaxDistortion: maxTheoreticalDistortion,
      verifiedAt: new Date().toISOString(),
      details: 'Selo notarial WORM de Privacidade Diferencial válido e matematicamente íntegro.'
    };
  } catch (err: any) {
    return {
      isValid: false,
      proofSeal,
      queryId: result.queryId,
      projectId: result.projectId,
      mechanism: result.mechanism,
      epsilon: result.epsilonUsed,
      theoreticalMaxDistortion: 0,
      verifiedAt: new Date().toISOString(),
      details: `Falha na decodificação do selo probatório: ${err.message}`
    };
  }
}

/**
 * Gera Benchmark Epidemiológico Clínico com Múltiplas Métricas Protegidas
 */
export function generateEpidemiologicalBenchmark(
  cohort: SyntheticClinicalPatient[],
  projectId: string,
  epsilonPerMetric = 0.25,
  mechanism: DpMechanism = DpMechanism.LAPLACE,
  secretSalt = DEFAULT_SECRET_SALT
): DpEpidemiologicalBenchmark {
  const benchmarkId = `bmk_${randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  // 1. Média de Remissão Clínica (Sessões)
  const resSessions = executeDifferentialPrivacyQuery(
    cohort,
    {
      projectId,
      metric: DpCohortMetric.REMISSION_DURATION_SESSIONS,
      queryType: DpQueryType.MEAN,
      epsilon: epsilonPerMetric,
      mechanism
    },
    secretSalt
  );

  // 2. Média Escore GAD-7 (Ansiedade)
  const resGad7 = executeDifferentialPrivacyQuery(
    cohort,
    {
      projectId,
      metric: DpCohortMetric.GAD7_SEVERITY_SCORE,
      queryType: DpQueryType.MEAN,
      epsilon: epsilonPerMetric,
      mechanism
    },
    secretSalt
  );

  // 3. Média Escore PHQ-9 (Depressão)
  const resPhq9 = executeDifferentialPrivacyQuery(
    cohort,
    {
      projectId,
      metric: DpCohortMetric.PHQ9_SEVERITY_SCORE,
      queryType: DpQueryType.MEAN,
      epsilon: epsilonPerMetric,
      mechanism
    },
    secretSalt
  );

  // 4. Média de Idade
  const resAge = executeDifferentialPrivacyQuery(
    cohort,
    {
      projectId,
      metric: DpCohortMetric.AGE_GROUP_DEMOGRAPHICS,
      queryType: DpQueryType.MEAN,
      epsilon: epsilonPerMetric,
      mechanism
    },
    secretSalt
  );

  const metrics = [
    {
      key: 'avg_remission_sessions',
      label: 'Sessões Médias para Remissão Clínica',
      noisyValue: typeof resSessions.noisyProtectedValue === 'number' ? resSessions.noisyProtectedValue : 18.5,
      unit: 'sessões',
      epsilonAllocated: epsilonPerMetric,
      mechanism
    },
    {
      key: 'avg_gad7_score',
      label: 'Gravidade Média de Ansiedade (GAD-7)',
      noisyValue: typeof resGad7.noisyProtectedValue === 'number' ? resGad7.noisyProtectedValue : 9.2,
      unit: 'pontos (0-21)',
      epsilonAllocated: epsilonPerMetric,
      mechanism
    },
    {
      key: 'avg_phq9_score',
      label: 'Gravidade Média de Depressão (PHQ-9)',
      noisyValue: typeof resPhq9.noisyProtectedValue === 'number' ? resPhq9.noisyProtectedValue : 11.4,
      unit: 'pontos (0-27)',
      epsilonAllocated: epsilonPerMetric,
      mechanism
    },
    {
      key: 'avg_patient_age',
      label: 'Idade Média da Coorte Clínica',
      noisyValue: typeof resAge.noisyProtectedValue === 'number' ? resAge.noisyProtectedValue : 37.8,
      unit: 'anos',
      epsilonAllocated: epsilonPerMetric,
      mechanism
    }
  ];

  const canonicalObj = {
    benchmarkId,
    cohortTotal: cohort.length,
    generatedAt: now,
    metrics,
    projectId
  };

  const digest = createHash('sha256').update(canonicalizeJson(canonicalObj)).digest('hex');
  const sig = createHmac('sha256', secretSalt).update(`dp_benchmark:${benchmarkId}:${digest}`).digest('hex');
  const proofSeal = `dp_v1_${Buffer.from(JSON.stringify({ v: 1, bid: benchmarkId, cnh: digest, sig }), 'utf8').toString('base64url')}`;

  return {
    benchmarkId,
    title: 'Benchmark Epidemiológico de Desfechos Clínicos em Saúde Mental (ε-DP)',
    cohortTotal: cohort.length,
    metrics,
    generatedAt: now,
    proofSeal
  };
}
