import crypto from 'node:crypto';
import { 
  AuditAction, 
  CustodianRole, 
  ThresholdReconstructionVerdict 
} from '@terapiainfoco/shared';
import type { 
  ShamirKeyShare, 
  ThresholdProofSeal 
} from '@terapiainfoco/shared';

// ============================================================================
// ARITMÉTICA DE CORPO FINITO GF(256) (GALOIS FIELD / RIJNDAEL PRIMITIVE POLY)
// Polinômio Irredutível: x^8 + x^4 + x^3 + x + 1 (0x11b = 283)
// Gerador primitivo: 3
// ============================================================================

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(function initGF256Tables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    // Multiplicação por 3 no corpo GF(256): (x << 1) ^ (x & 0x80 ? 0x11b : 0) ^ x
    let xDouble = x << 1;
    if (xDouble & 0x100) {
      xDouble ^= 0x11b;
    }
    x = xDouble ^ x;
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
  GF256_LOG[0] = 0; // Por convenção
})();

export function gfAdd(a: number, b: number): number {
  return (a ^ b) & 0xff;
}

export function gfSub(a: number, b: number): number {
  return (a ^ b) & 0xff; // No GF(2^8) soma e subtração são idênticas ao XOR
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Divisão por zero em GF(256) é indefinida.');
  }
  if (a === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] - GF256_LOG[b] + 255) % 255];
}

/**
 * Avalia um polinômio P(x) = c0 + c1*x + c2*x^2 + ... + c_{t-1}*x^{t-1} em GF(256)
 * Utiliza o Esquema de Horner para complexidade O(t).
 */
export function evaluatePolynomial(coefficients: Uint8Array, x: number): number {
  if (coefficients.length === 0) return 0;
  if (x === 0) return coefficients[0];

  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coefficients[i]);
  }
  return result;
}

/**
 * Interpolação Polinomial de Lagrange avaliada estritamente em x = 0 (Recuperação do Segredo P(0))
 * P(0) = sum_{j=0}^{k-1} y_j * product_{m != j} (0 - x_m) / (x_j - x_m)
 */
export function interpolateLagrangeAtZero(points: Array<{ x: number; y: number }>): number {
  const k = points.length;
  let secret = 0;

  for (let j = 0; j < k; j++) {
    const xj = points[j].x;
    const yj = points[j].y;

    let basis = 1;
    for (let m = 0; m < k; m++) {
      if (m === j) continue;
      const xm = points[m].x;
      // No GF(256): (0 - xm) = xm, e (xj - xm) = xj ^ xm
      const numerator = xm;
      const denominator = gfSub(xj, xm);
      basis = gfMul(basis, gfDiv(numerator, denominator));
    }

    secret = gfAdd(secret, gfMul(yj, basis));
  }

  return secret;
}

// ============================================================================
// SHAMIR'S SECRET SHARING (SSS) SOBRE SEQUÊNCIA DE BYTES
// ============================================================================

export interface RawShamirShare {
  shareIndex: number; // x na faixa 1..n
  data: Uint8Array;   // y_i para cada byte i
}

/**
 * Divide um segredo arbitrário em N cotas com limite de threshold T
 */
export function splitSecretBytes(
  secret: Uint8Array, 
  threshold: number, 
  totalShares: number
): RawShamirShare[] {
  if (threshold < 2) {
    throw new Error('Threshold mínimo deve ser 2 (mínimo de 2 participantes para quorum).');
  }
  if (totalShares < threshold) {
    throw new Error(`Total de cotas (${totalShares}) não pode ser inferior ao threshold (${threshold}).`);
  }
  if (totalShares > 254) {
    throw new Error('Total de cotas excede a capacidade do corpo finito GF(256) (máx: 254).');
  }
  if (secret.length === 0) {
    throw new Error('O segredo fornecido não pode ser vazio.');
  }

  const shares: RawShamirShare[] = [];
  for (let i = 1; i <= totalShares; i++) {
    shares.push({
      shareIndex: i,
      data: new Uint8Array(secret.length)
    });
  }

  const poly = new Uint8Array(threshold);

  // Para cada byte do segredo, constrói um polinômio independente
  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    poly[0] = secret[byteIdx]; // Termo constante a0 = segredo
    // Coeficientes a1 ... a_{t-1} gerados aleatoriamente com entropia CSPRNG
    const randomBytes = crypto.randomBytes(threshold - 1);
    for (let c = 1; c < threshold; c++) {
      poly[c] = randomBytes[c - 1];
    }

    // Avalia o polinômio para cada cota x = 1..totalShares
    for (let s = 0; s < totalShares; s++) {
      const x = shares[s].shareIndex;
      shares[s].data[byteIdx] = evaluatePolynomial(poly, x);
    }
  }

  return shares;
}

/**
 * Recompõe o segredo original usando interpolação de Lagrange com qualquer subconjunto >= T cotas
 */
export function reconstructSecretBytes(
  submittedShares: Array<{ shareIndex: number; data: Uint8Array }>,
  threshold: number
): Uint8Array {
  if (submittedShares.length < threshold) {
    throw new Error(`Quorum insuficiente: ${submittedShares.length} cotas recebidas, threshold é ${threshold}.`);
  }

  // Validação de unicidade das coordenadas x
  const seenIndexes = new Set<number>();
  for (const s of submittedShares) {
    if (s.shareIndex < 1 || s.shareIndex > 254) {
      throw new Error(`Índice de cota inválido: ${s.shareIndex}`);
    }
    if (seenIndexes.has(s.shareIndex)) {
      throw new Error(`Cota duplicada detectada: índice ${s.shareIndex}`);
    }
    seenIndexes.add(s.shareIndex);
  }

  // Utiliza exatamente as primeiras 'threshold' cotas
  const activeSubset = submittedShares.slice(0, threshold);
  const secretLength = activeSubset[0].data.length;

  for (const s of activeSubset) {
    if (s.data.length !== secretLength) {
      throw new Error('Comprimento inconsistente entre as cotas fornecidas.');
    }
  }

  const recoveredSecret = new Uint8Array(secretLength);
  const points = new Array<{ x: number; y: number }>(threshold);

  for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
    for (let p = 0; p < threshold; p++) {
      points[p] = {
        x: activeSubset[p].shareIndex,
        y: activeSubset[p].data[byteIdx]
      };
    }
    recoveredSecret[byteIdx] = interpolateLagrangeAtZero(points);
  }

  return recoveredSecret;
}

// ============================================================================
// CIFRAGEM & LACRAMENTO DE PRONTUÁRIOS SOB ORDEM JUDICIAL (AES-256-GCM + SSS)
// ============================================================================

export function computeShareChecksum(shareIndex: number, shareDataHex: string): string {
  return crypto
    .createHash('sha256')
    .update(`share:${shareIndex}:${shareDataHex}`)
    .digest('hex')
    .slice(0, 16);
}

export function validateShareIntegrity(share: ShamirKeyShare): boolean {
  const expected = computeShareChecksum(share.shareIndex, share.shareData);
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(share.checksum, 'utf8'));
}

export interface SealedCourtOrderRecord {
  cipheredRecordPayload: string;
  ivHex: string;
  authTagHex: string;
  generatedShares: ShamirKeyShare[];
  dekChecksum: string;
}

/**
 * Cifra o prontuário com uma chave de uso único DEK (32 bytes AES-256)
 * e particiona essa DEK entre os custodiantes legais via Shamir SSS (t-of-n).
 */
export function sealClinicalRecord(
  recordText: string,
  threshold: number,
  totalShares: number,
  custodians: Array<{ role: CustodianRole; name: string }>
): SealedCourtOrderRecord {
  if (custodians.length !== totalShares) {
    throw new Error(`Número de custodiantes (${custodians.length}) diverge do total de cotas (${totalShares}).`);
  }

  // 1. Gera DEK efêmera de 256 bits (32 bytes)
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // 2. Cifra o conteúdo do prontuário com AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  let encrypted = cipher.update(recordText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // 3. Divide a DEK com Shamir (t-of-n)
  const rawShares = splitSecretBytes(dek, threshold, totalShares);

  const generatedShares: ShamirKeyShare[] = rawShares.map((raw, idx) => {
    const hexData = Buffer.from(raw.data).toString('hex');
    const checksum = computeShareChecksum(raw.shareIndex, hexData);
    return {
      shareIndex: raw.shareIndex,
      shareData: hexData,
      custodianRole: custodians[idx].role,
      custodianName: custodians[idx].name,
      checksum
    };
  });

  const dekChecksum = crypto.createHash('sha256').update(dek).digest('hex');

  return {
    cipheredRecordPayload: encrypted,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    generatedShares,
    dekChecksum
  };
}

/**
 * Recompõe a DEK a partir das cotas do colegiado e decifra o prontuário.
 */
export function unsealClinicalRecord(
  cipheredPayload: string,
  ivHex: string,
  authTagHex: string,
  shares: ShamirKeyShare[],
  threshold: number
): { decryptedText: string; recoveredKeyHex: string } {
  // 1. Valida integridade e ausência de corrupção em cada cota
  for (const s of shares) {
    if (!validateShareIntegrity(s)) {
      throw new Error(`Cota #${s.shareIndex} (${s.custodianRole}) possui checksum corrompido ou foi adulterada.`);
    }
  }

  // 2. Converte para raw shares
  const rawSubset = shares.map((s) => ({
    shareIndex: s.shareIndex,
    data: new Uint8Array(Buffer.from(s.shareData, 'hex'))
  }));

  // 3. Recompõe a DEK via interpolação de Lagrange
  const recoveredDek = reconstructSecretBytes(rawSubset, threshold);
  const recoveredKeyHex = Buffer.from(recoveredDek).toString('hex');

  // 4. Decifra com AES-256-GCM
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', recoveredDek, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipheredPayload, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return {
    decryptedText: decrypted,
    recoveredKeyHex
  };
}

// ============================================================================
// SELOS PROBATÓRIOS NOTARIAIS WORM (RFC 8785 JSON CANONICALIZATION SCHEME)
// ============================================================================

export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + entries.join(',') + '}';
}

export function toBase64Url(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64Url(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function createThresholdProofSeal(
  vaultId: string,
  action: AuditAction,
  details: object,
  masterKey: string
): ThresholdProofSeal {
  const issuedAt = new Date().toISOString();
  const canonicalData = {
    vaultId,
    action,
    details,
    issuedAt
  };

  const canonicalJson = canonicalStringify(canonicalData);
  const canonicalDigest = crypto.createHash('sha256').update(canonicalJson).digest('hex');

  const signature = crypto
    .createHmac('sha256', masterKey)
    .update(`THRESHOLD_WORM_SEAL:${canonicalDigest}`)
    .digest('hex');

  const payload = {
    vaultId,
    action,
    canonicalDigest,
    issuedAt,
    signature
  };

  const sealToken = `threshold_v1_${toBase64Url(JSON.stringify(payload))}`;

  return {
    sealToken,
    canonicalDigest,
    action,
    vaultId,
    issuedAt,
    signature
  };
}

export function verifyThresholdProofSeal(
  sealToken: string,
  masterKey: string
): { isValid: boolean; payload?: any; message: string } {
  try {
    if (!sealToken || !sealToken.startsWith('threshold_v1_')) {
      return { isValid: false, message: 'Prefixo de token de selo probatório inválido.' };
    }

    const rawB64 = sealToken.replace('threshold_v1_', '');
    const jsonStr = fromBase64Url(rawB64);
    const parsed = JSON.parse(jsonStr);

    if (!parsed.vaultId || !parsed.canonicalDigest || !parsed.signature) {
      return { isValid: false, message: 'Estrutura do selo probatório incompleta.' };
    }

    const expectedSig = crypto
      .createHmac('sha256', masterKey)
      .update(`THRESHOLD_WORM_SEAL:${parsed.canonicalDigest}`)
      .digest('hex');

    const match = crypto.timingSafeEqual(
      Buffer.from(parsed.signature, 'utf8'),
      Buffer.from(expectedSig, 'utf8')
    );

    if (!match) {
      return { isValid: false, message: 'Assinatura do selo probatório adulterada ou forjada.' };
    }

    return {
      isValid: true,
      payload: parsed,
      message: 'Selo probatório WORM de Threshold Cryptography validado com fé pública.'
    };
  } catch (err: any) {
    return { isValid: false, message: `Erro ao validar selo: ${err.message}` };
  }
}
