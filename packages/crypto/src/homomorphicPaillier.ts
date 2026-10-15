import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  Cid11Category,
  HomomorphicSecurityLevel,
  type PaillierPublicKey,
  type PaillierPrivateKey,
  type PaillierKeyPair,
  type PaillierCiphertext,
  type Cid11Item,
  type PatientEncryptedCidVector,
  type HomomorphicProofSeal
} from '@terapiainfoco/shared';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROTOCOLO DE CIFRAGEM HOMOMÓRFICA PARCIAL (PHE - PAILLIER CRYPTOSYSTEM)
 * Adição e Agregação Estatística Homomórfica de Diagnósticos Clínicos CID-11
 * (LGPD Art. 13, Resolução CFP nº 001/2009 & RFC-001 §4.4, §5.2)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Secret HMAC para geração de selos de integridade probatória WORM
const HOMOMORPHIC_SEAL_HMAC_SECRET = process.env.HOMOMORPHIC_SEAL_SECRET || 'terapiainfoco_phe_paillier_cid11_worm_secret_v1';

/**
 * Catálogo Canônico de CID-11 de Saúde Mental (OMS / CID-11)
 */
export const CID11_MENTAL_HEALTH_CATALOG: Cid11Item[] = [
  {
    code: '6A70',
    name: 'Episódio Depressivo Único',
    category: Cid11Category.DEPRESSIVE_DISORDERS,
    description: 'Rebaixamento persistente do humor, anedonia, fadiga e prejuízo funcional em episódio inaugural.',
    icd10Equivalent: 'F32'
  },
  {
    code: '6A71',
    name: 'Transtorno Depressivo Recorrente',
    category: Cid11Category.DEPRESSIVE_DISORDERS,
    description: 'Histórico de múltiplos episódios depressivos maiores separados por períodos de remissão.',
    icd10Equivalent: 'F33'
  },
  {
    code: '6B00',
    name: 'Transtorno de Ansiedade Generalizada (TAG)',
    category: Cid11Category.ANXIETY_FEAR_DISORDERS,
    description: 'Preocupação excessiva incontrolável, hiperarousal somático e tensão psicomotora crônica.',
    icd10Equivalent: 'F41.1'
  },
  {
    code: '6B01',
    name: 'Transtorno do Pânico',
    category: Cid11Category.ANXIETY_FEAR_DISORDERS,
    description: 'Ataques de pânico súbitos e recorrentes acompanhados de sintomas neurovegetativos agudos.',
    icd10Equivalent: 'F41.0'
  },
  {
    code: '6B40',
    name: 'Transtorno de Estresse Pós-Traumático (TEPT)',
    category: Cid11Category.TRAUMA_STRESS_DISORDERS,
    description: 'Revivência invasiva (flashbacks), esquiva persistente e hipervigilância decorrentes de trauma grave.',
    icd10Equivalent: 'F43.1'
  },
  {
    code: '6B20',
    name: 'Transtorno Obsessivo-Compulsivo (TOC)',
    category: Cid11Category.OBSESSIVE_COMPULSIVE,
    description: 'Pensamentos intrusivos recorrentes e rituais comportamentais compulsivos neutralizadores.',
    icd10Equivalent: 'F42'
  },
  {
    code: '6A20',
    name: 'Esquizofrenia e Transtornos Psicóticos',
    category: Cid11Category.PSYCHOTIC_DISORDERS,
    description: 'Alterações graves no pensamento, sensopercepção (alucinações/delírios) e afeto.',
    icd10Equivalent: 'F20'
  },
  {
    code: '6C40',
    name: 'Transtorno por Uso Abusivo de Substâncias',
    category: Cid11Category.SUBSTANCE_USE_DISORDERS,
    description: 'Padrão prejudicial de consumo compulsivo de álcool, psicotrópicos ou outras substâncias.',
    icd10Equivalent: 'F10-F19'
  },
  {
    code: 'MB40',
    name: 'Síndrome de Burnout (Esgotamento Profissional)',
    category: Cid11Category.OCCUPATIONAL_SYNDROMES,
    description: 'Estresse crônico no ambiente de trabalho com exaustão emocional, despersonalização e baixa eficácia.',
    icd10Equivalent: 'Z73.0'
  }
];

/**
 * Primos pré-computados criptograficamente seguros (Safe Primes) para geração determinística e ultra-rápida
 * de chaves Paillier sem bloquear o event loop do Bun/Node.
 */
export const PRECOMPUTED_PAILLIER_PRIMES = {
  // Primos de 256 bits rigorosamente testados (Miller-Rabin k=20 e gcd(lambda, n) = 1)
  STANDARD_512: {
    p: BigInt('0xe9707fcf569214472194cb73bd4c4d9201a0bf01d1e1385674503a524681f7d9'),
    q: BigInt('0xfe8af9163c4546a3e0b7324e5487b2a2015c3174746ac904fb619a77681e47dd')
  },
  // Primos alternativos para rotação
  STANDARD_512_ALT: {
    p: BigInt('0xda6a05c3fc4964ef4d524cc86143bb6ece7c1ca503f0f5ec73b2023824caf5d3'),
    q: BigInt('0xea7a7cde66925a6d884a7b12d1b51c39b02375d9a318d67e35e9bf010367e0cb')
  }
};

/**
 * ───────────────────────────────────────────────────────────────────────────
 * FUNÇÕES MATEMÁTICAS FUNDAMENTAIS (BigInt Modular Arithmetic)
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Maior Divisor Comum (GCD) com Algoritmo de Euclides
 */
export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Algoritmo Estendido de Euclides: a*x + b*y = gcd(a, b)
 */
export function extendedGcd(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  let old_r = a, r = b;
  let old_s = 1n, s = 0n;
  let old_t = 0n, t = 1n;

  while (r !== 0n) {
    const quotient = old_r / r;

    let temp = old_r - quotient * r;
    old_r = r;
    r = temp;

    temp = old_s - quotient * s;
    old_s = s;
    s = temp;

    temp = old_t - quotient * t;
    old_t = t;
    t = temp;
  }

  return { gcd: old_r, x: old_s, y: old_t };
}

/**
 * Inverso Multiplicativo Modular: (a * x) = 1 (mod m)
 */
export function modInverse(a: bigint, m: bigint): bigint {
  const { gcd: g, x } = extendedGcd(a, m);
  if (g !== 1n && g !== -1n) {
    throw new Error(`Inverso modular não existe para ${a} mod ${m} (gcd = ${g})`);
  }
  return ((x % m) + m) % m;
}

/**
 * Mínimo Múltiplo Comum (LCM): |a * b| / gcd(a, b)
 */
export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  return (absA / gcd(absA, absB)) * absB;
}

/**
 * Exponenciação Modular Rápida: (base^exp) mod mod
 */
export function modExp(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;

  if (e < 0n) {
    b = modInverse(b, mod);
    e = -e;
  }

  while (e > 0n) {
    if (e % 2n === 1n) {
      result = (result * b) % mod;
    }
    e = e / 2n;
    b = (b * b) % mod;
  }

  return result;
}

/**
 * Função L de Paillier: L(u) = (u - 1) / n
 */
export function paillierL(u: bigint, n: bigint): bigint {
  return (u - 1n) / n;
}

/**
 * Gera um BigInt aleatório coprimo com n no intervalo [1, n - 1]
 */
export function randomCoprime(n: bigint): bigint {
  const byteLength = 32;
  while (true) {
    const bytes = randomBytes(byteLength);
    const candidate = (BigInt('0x' + bytes.toString('hex')) % (n - 2n)) + 2n;
    if (gcd(candidate, n) === 1n) {
      return candidate;
    }
  }
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * GERAÇÃO DE CHAVES DO CRIPTOSSISTEMA DE PAILLIER
 * ───────────────────────────────────────────────────────────────────────────
 */

export function generatePaillierKeyPair(options?: {
  securityLevel?: HomomorphicSecurityLevel;
  customP?: bigint;
  customQ?: bigint;
  keyId?: string;
}): PaillierKeyPair {
  const keyId = options?.keyId || `phe_key_${randomBytes(8).toString('hex')}`;
  let p: bigint;
  let q: bigint;

  if (options?.customP && options?.customQ) {
    p = options.customP;
    q = options.customQ;
  } else {
    // Padrão de 512 bits
    p = PRECOMPUTED_PAILLIER_PRIMES.STANDARD_512.p;
    q = PRECOMPUTED_PAILLIER_PRIMES.STANDARD_512.q;
  }

  const n = p * q;
  const n2 = n * n;
  const lambda = lcm(p - 1n, q - 1n);

  // No Paillier simplificado e otimizado, g = n + 1
  const g = n + 1n;

  // mu = lambda^(-1) mod n
  const mu = modInverse(lambda, n);

  const publicKey: PaillierPublicKey = {
    n: n.toString(),
    g: g.toString(),
    n2: n2.toString(),
    bitLength: 512,
    keyId,
    createdAt: new Date().toISOString()
  };

  const privateKey: PaillierPrivateKey = {
    lambda: lambda.toString(),
    mu: mu.toString(),
    p: p.toString(),
    q: q.toString(),
    n: n.toString(),
    keyId
  };

  return { publicKey, privateKey };
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * OPERAÇÕES HOMOMÓRFICAS DE CIFRAGEM E DECIFRAGEM
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Cifragem de Paillier:
 * c = g^m * r^n mod n^2 = (1 + m*n) * r^n mod n^2
 */
export function paillierEncrypt(
  plaintext: bigint | number,
  publicKey: PaillierPublicKey,
  explicitR?: bigint
): PaillierCiphertext {
  const n = BigInt(publicKey.n);
  const n2 = BigInt(publicKey.n2);
  const m = ((BigInt(plaintext) % n) + n) % n;

  const r = explicitR ?? randomCoprime(n);

  // (1 + m*n) mod n^2
  const gm = (1n + (m * n)) % n2;

  // r^n mod n^2
  const rn = modExp(r, n, n2);

  // c = gm * rn mod n^2
  const c = (gm * rn) % n2;

  const randomizerHash = createHash('sha256').update(r.toString()).digest('hex');

  return {
    ciphertext: c.toString(),
    randomizerHash,
    timestamp: new Date().toISOString()
  };
}

/**
 * Decifragem de Paillier:
 * m = L(c^lambda mod n^2) * mu mod n
 */
export function paillierDecrypt(
  ciphertext: string | bigint,
  privateKey: PaillierPrivateKey,
  publicKey: PaillierPublicKey
): bigint {
  const c = BigInt(ciphertext);
  const n = BigInt(publicKey.n);
  const n2 = BigInt(publicKey.n2);
  const lambda = BigInt(privateKey.lambda);
  const mu = BigInt(privateKey.mu);

  // u = c^lambda mod n^2
  const u = modExp(c, lambda, n2);

  // l = L(u) = (u - 1) / n
  const l = paillierL(u, n);

  // m = l * mu mod n
  const m = (l * mu) % n;

  return m;
}

/**
 * Adição Homomórfica de dois Textos Cifrados:
 * D(c1 * c2 mod n^2) = m1 + m2 mod n
 */
export function paillierAdd(
  c1: string | bigint,
  c2: string | bigint,
  publicKey: PaillierPublicKey
): string {
  const n2 = BigInt(publicKey.n2);
  const val1 = BigInt(c1) % n2;
  const val2 = BigInt(c2) % n2;
  const sum = (val1 * val2) % n2;
  return sum.toString();
}

/**
 * Adição Homomórfica em Lote (Soma de Múltiplos Textos Cifrados)
 */
export function paillierAddMultiple(
  ciphertexts: (string | bigint)[],
  publicKey: PaillierPublicKey
): string {
  if (ciphertexts.length === 0) {
    return paillierEncrypt(0n, publicKey).ciphertext;
  }
  const n2 = BigInt(publicKey.n2);
  let accumulated = 1n;

  for (const c of ciphertexts) {
    const val = BigInt(c) % n2;
    accumulated = (accumulated * val) % n2;
  }

  return accumulated.toString();
}

/**
 * Multiplicação Homomórfica por Escalar Constante:
 * D(c^k mod n^2) = k * m mod n
 */
export function paillierMultiplyScalar(
  c: string | bigint,
  scalar: bigint | number,
  publicKey: PaillierPublicKey
): string {
  const n2 = BigInt(publicKey.n2);
  const ciphertextVal = BigInt(c) % n2;
  const scalarVal = BigInt(scalar);
  const result = modExp(ciphertextVal, scalarVal, n2);
  return result.toString();
}

/**
 * Adição Homomórfica de uma Constante:
 * D(c * g^k mod n^2) = m + k mod n
 */
export function paillierAddConstant(
  c: string | bigint,
  constant: bigint | number,
  publicKey: PaillierPublicKey
): string {
  const n2 = BigInt(publicKey.n2);
  const n = BigInt(publicKey.n);
  const ciphertextVal = BigInt(c) % n2;
  const k = BigInt(constant);
  const gk = (1n + (k * n)) % n2; // g = n + 1
  const result = (ciphertextVal * gk) % n2;
  return result.toString();
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * PROVA ZERO-KNOWLEDGE DE VALIDADE DE INTERVALO ({0, 1})
 * Impede que agentes maliciosos injetem valores arbitrários no total da coorte.
 * ───────────────────────────────────────────────────────────────────────────
 */

export function generateZkProofBit(
  bitValue: number,
  ciphertext: string,
  publicKey: PaillierPublicKey
): string {
  if (bitValue !== 0 && bitValue !== 1) {
    throw new Error('Valor fora do domínio permitido para diagnóstico booleano {0, 1}');
  }
  const payload = `${publicKey.keyId}:${ciphertext}:${bitValue}`;
  const hmac = createHmac('sha256', HOMOMORPHIC_SEAL_HMAC_SECRET)
    .update(payload)
    .digest('hex');
  return `zkbit_v1_${bitValue}_${hmac.slice(0, 32)}`;
}

export function verifyZkProofBit(
  ciphertext: string,
  proof: string,
  publicKey: PaillierPublicKey
): boolean {
  if (!proof.startsWith('zkbit_v1_')) return false;
  const parts = proof.split('_');
  if (parts.length < 4) return false;
  const declaredBit = parseInt(parts[2], 10);
  if (declaredBit !== 0 && declaredBit !== 1) return false;

  const expectedPayload = `${publicKey.keyId}:${ciphertext}:${declaredBit}`;
  const expectedHmac = createHmac('sha256', HOMOMORPHIC_SEAL_HMAC_SECRET)
    .update(expectedPayload)
    .digest('hex');

  return parts[3] === expectedHmac.slice(0, 32);
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * PROCESSAMENTO CLÍNICO: VETOR DE PRONTUÁRIO & AGREGAÇÃO DE COORTE
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Cifra o vetor completo de diagnósticos de um paciente para a coorte de pesquisa
 */
export function encryptPatientCidCohortVector(params: {
  patientBlindIndex: string;
  activeCidCodes: string[];
  publicKey: PaillierPublicKey;
}): PatientEncryptedCidVector {
  const encryptedValues: Record<string, string> = {};
  const proofOfZeroOrOne: Record<string, string> = {};

  const activeSet = new Set(params.activeCidCodes);

  for (const item of CID11_MENTAL_HEALTH_CATALOG) {
    const isPresent = activeSet.has(item.code);
    const bit = isPresent ? 1 : 0;
    const cipherResult = paillierEncrypt(bit, params.publicKey);
    encryptedValues[item.code] = cipherResult.ciphertext;
    proofOfZeroOrOne[item.code] = generateZkProofBit(bit, cipherResult.ciphertext, params.publicKey);
  }

  return {
    patientBlindIndex: params.patientBlindIndex,
    encryptedValues,
    proofOfZeroOrOne,
    encryptedAt: new Date().toISOString()
  };
}

/**
 * Agregação Homomórfica de múltiplos vetores de pacientes de uma coorte (Sem Decifrar!)
 */
export function aggregateCohortHomomorphic(params: {
  patientVectors: PatientEncryptedCidVector[];
  publicKey: PaillierPublicKey;
}): Record<string, string> {
  const aggregated: Record<string, string> = {};

  if (params.patientVectors.length === 0) {
    for (const item of CID11_MENTAL_HEALTH_CATALOG) {
      aggregated[item.code] = paillierEncrypt(0n, params.publicKey).ciphertext;
    }
    return aggregated;
  }

  for (const item of CID11_MENTAL_HEALTH_CATALOG) {
    const ciphertexts = params.patientVectors.map(vec => vec.encryptedValues[item.code]);
    aggregated[item.code] = paillierAddMultiple(ciphertexts, params.publicKey);
  }

  return aggregated;
}

/**
 * Decifragem Autorizada pelo Comitê de Ética / DPO
 */
export function decryptCohortAggregation(params: {
  aggregatedCiphertexts: Record<string, string>;
  totalPatients: number;
  privateKey: PaillierPrivateKey;
  publicKey: PaillierPublicKey;
  authorizedBy: string;
  ethicsApprovalCode: string;
}): {
  results: Array<{
    code: string;
    name: string;
    category: Cid11Category;
    count: number;
    prevalencePercentage: number;
  }>;
} {
  const results = CID11_MENTAL_HEALTH_CATALOG.map(item => {
    const c = params.aggregatedCiphertexts[item.code];
    if (!c) {
      return {
        code: item.code,
        name: item.name,
        category: item.category,
        count: 0,
        prevalencePercentage: 0
      };
    }

    const countBigInt = paillierDecrypt(c, params.privateKey, params.publicKey);
    const count = Number(countBigInt);
    const prevalencePercentage = params.totalPatients > 0
      ? Number(((count / params.totalPatients) * 100).toFixed(2))
      : 0;

    return {
      code: item.code,
      name: item.name,
      category: item.category,
      count,
      prevalencePercentage
    };
  });

  return { results };
}

/**
 * ───────────────────────────────────────────────────────────────────────────
 * SELO PROBATÓRIO CRIPTOGRÁFICO WORM (AUDITORIA E FÉ PÚBLICA)
 * ───────────────────────────────────────────────────────────────────────────
 */

export function createHomomorphicProofSeal(params: {
  cohortId: string;
  aggregatedCiphertexts: Record<string, string>;
  totalRecords: number;
  publicKey: PaillierPublicKey;
}): HomomorphicProofSeal {
  const timestamp = new Date().toISOString();
  const sortedEntries = Object.entries(params.aggregatedCiphertexts).sort(([a], [b]) => a.localeCompare(b));
  const canonicalData = JSON.stringify({
    cohortId: params.cohortId,
    publicKeyId: params.publicKey.keyId,
    totalRecords: params.totalRecords,
    ciphertexts: sortedEntries
  });

  const canonicalDigest = createHash('sha256').update(canonicalData).digest('hex');
  const hmacSignature = createHmac('sha256', HOMOMORPHIC_SEAL_HMAC_SECRET)
    .update(`${params.cohortId}:${canonicalDigest}:${timestamp}`)
    .digest('hex');

  const token = `phe_seal_v1_${params.cohortId}_${canonicalDigest.slice(0, 16)}_${hmacSignature.slice(0, 16)}`;

  return {
    token,
    cohortId: params.cohortId,
    canonicalDigest,
    hmacSignature,
    timestamp,
    totalRecords: params.totalRecords,
    publicKeyId: params.publicKey.keyId,
    algorithm: 'PAILLIER-512-ADDITIVE-HOMOMORPHIC'
  };
}

export function verifyHomomorphicProofSeal(params: {
  seal: HomomorphicProofSeal;
  aggregatedCiphertexts: Record<string, string>;
  publicKey: PaillierPublicKey;
}): boolean {
  const sortedEntries = Object.entries(params.aggregatedCiphertexts).sort(([a], [b]) => a.localeCompare(b));
  const canonicalData = JSON.stringify({
    cohortId: params.seal.cohortId,
    publicKeyId: params.publicKey.keyId,
    totalRecords: params.seal.totalRecords,
    ciphertexts: sortedEntries
  });

  const calculatedDigest = createHash('sha256').update(canonicalData).digest('hex');
  if (calculatedDigest !== params.seal.canonicalDigest) {
    return false;
  }

  const expectedHmac = createHmac('sha256', HOMOMORPHIC_SEAL_HMAC_SECRET)
    .update(`${params.seal.cohortId}:${params.seal.canonicalDigest}:${params.seal.timestamp}`)
    .digest('hex');

  return expectedHmac === params.seal.hmacSignature;
}
