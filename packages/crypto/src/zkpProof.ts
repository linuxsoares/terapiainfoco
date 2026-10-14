import { createHash, randomBytes } from 'node:crypto';
import type {
  ZkpSchnorrProof,
  ZkpClinicalDocumentProof,
  ZkpVerificationResult
} from '@terapiainfoco/shared';

/**
 * Parâmetros criptográficos do grupo cíclico de Schnorr (RFC 5114 MODP 1024/160 adaptado para 256-bit BigInt)
 * Seguro para provas não interativas de conhecimento de logaritmo discreto.
 */
export const ZKP_PARAMS = {
  // Primo de 256 bits (Field Prime secp256k1)
  p: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F'),
  // Ordem do grupo multiplicativo (p - 1)
  q: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2E'),
  // Gerador público g
  g: BigInt('2')
};

/**
 * Exponenciação modular rápida e segura: (base^exp) mod mod
 */
export function modExp(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;

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
 * Gera um BigInt seguro e aleatório no intervalo [1, max - 1]
 */
export function randomBigInt(max: bigint): bigint {
  const byteLength = 32;
  while (true) {
    const bytes = randomBytes(byteLength);
    const hex = '0x' + bytes.toString('hex');
    const val = BigInt(hex) % max;
    if (val > 1n) {
      return val;
    }
  }
}

/**
 * 1. Gera Prova de Conhecimento Zero Schnorr (Fiat-Shamir NIZK)
 * O provador atesta que possui o segredo x (chave de assinatura e salt do documento),
 * tal que Y = g^x mod p, sem NUNCA revelar x para o verificador.
 */
export function createSchnorrZkpProof(params: {
  secretValue: bigint | string; // x
  contextMetadata: string;      // Metadata pública (tipo do doc, data, CRP commitment)
  p?: bigint;
  q?: bigint;
  g?: bigint;
}): ZkpSchnorrProof {
  const p = params.p ?? ZKP_PARAMS.p;
  const q = params.q ?? ZKP_PARAMS.q;
  const g = params.g ?? ZKP_PARAMS.g;

  let x: bigint;
  if (typeof params.secretValue === 'string') {
    const hash = createHash('sha256').update(params.secretValue).digest('hex');
    x = (BigInt('0x' + hash) % (q - 1n)) + 1n;
  } else {
    x = (params.secretValue % (q - 1n)) + 1n;
  }

  // Chave pública / compromisso: Y = g^x mod p
  const Y = modExp(g, x, p);

  // Valor efêmero aleatório: r in [1, q-1]
  const r = randomBigInt(q);

  // Compromisso efêmero: R = g^r mod p
  const R = modExp(g, r, p);

  // Desafio Fiat-Shamir: c = H(g || Y || R || contextMetadata) mod q
  const challengePreimage = `${g.toString(16)}|${Y.toString(16)}|${R.toString(16)}|${params.contextMetadata}`;
  const challengeHash = createHash('sha256').update(challengePreimage).digest('hex');
  const c = (BigInt('0x' + challengeHash) % q) + 1n;

  // Resposta Schnorr: s = (r + c * x) mod q
  const s = (r + (c * x)) % q;

  return {
    commitHex: R.toString(16),
    challengeHex: c.toString(16),
    responseHex: s.toString(16),
    generatorHex: g.toString(16),
    publicKeyCommitmentHex: Y.toString(16)
  };
}

/**
 * 2. Verifica a Prova de Conhecimento Zero Schnorr
 * Testa se g^s = R * Y^c (mod p) e se c = H(g || Y || R || metadata)
 */
export function verifySchnorrZkpProof(params: {
  proof: ZkpSchnorrProof;
  contextMetadata: string;
  p?: bigint;
  q?: bigint;
}): { valid: boolean; reason?: string } {
  const p = params.p ?? ZKP_PARAMS.p;
  const q = params.q ?? ZKP_PARAMS.q;

  try {
    const R = BigInt('0x' + params.proof.commitHex);
    const c = BigInt('0x' + params.proof.challengeHex);
    const s = BigInt('0x' + params.proof.responseHex);
    const g = BigInt('0x' + params.proof.generatorHex);
    const Y = BigInt('0x' + params.proof.publicKeyCommitmentHex);

    // 1. Recalcula e valida o desafio de Fiat-Shamir
    const challengePreimage = `${g.toString(16)}|${Y.toString(16)}|${R.toString(16)}|${params.contextMetadata}`;
    const calculatedHash = createHash('sha256').update(challengePreimage).digest('hex');
    const expectedC = (BigInt('0x' + calculatedHash) % q) + 1n;

    if (c !== expectedC) {
      return {
        valid: false,
        reason: 'Desafio Fiat-Shamir inválido: compromisso ou contexto foram adulterados.'
      };
    }

    // 2. Valida a equação de Schnorr: g^s == R * (Y^c) mod p
    const leftSide = modExp(g, s, p);
    const Y_c = modExp(Y, c, p);
    const rightSide = (R * Y_c) % p;

    if (leftSide !== rightSide) {
      return {
        valid: false,
        reason: 'Equação de Schnorr violada: o provador não detém o segredo alegado.'
      };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      reason: `Erro na validação matemática da prova ZKP: ${err.message}`
    };
  }
}

/**
 * 3. Cria compromisso cego para o registro profissional CRP
 */
export function createTherapistCrpCommitment(crpNumber: string, salt: string): string {
  return createHash('sha256')
    .update(`CRP_COMMITMENT:${crpNumber.trim().toUpperCase()}:${salt}`)
    .digest('hex');
}

/**
 * 4. Gera digest probatório canônico WORM para a prova ZKP
 */
export function calculateZkpDigest(params: {
  proofId: string;
  documentId: string;
  crpCommitment: string;
  documentType: string;
  challengeHex: string;
  commitHex: string;
}): string {
  const canonical = [
    `PROOF_ID=${params.proofId}`,
    `DOCUMENT_ID=${params.documentId}`,
    `CRP_COMMITMENT=${params.crpCommitment}`,
    `DOC_TYPE=${params.documentType}`,
    `CHALLENGE=${params.challengeHex}`,
    `COMMIT=${params.commitHex}`
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * 5. Codifica prova em token público Zero-Knowledge seguro (Base64URL)
 */
export function encodeZkpToken(proof: ZkpClinicalDocumentProof): string {
  const jsonStr = JSON.stringify(proof);
  return 'zkp_v1_' + Buffer.from(jsonStr).toString('base64url');
}

/**
 * 6. Decodifica token público Zero-Knowledge
 */
export function decodeZkpToken(token: string): ZkpClinicalDocumentProof {
  if (!token.startsWith('zkp_v1_')) {
    throw new Error('Prefixo de token ZKP inválido (deve iniciar com zkp_v1_).');
  }
  const base64url = token.slice('zkp_v1_'.length);
  const jsonStr = Buffer.from(base64url, 'base64url').toString('utf-8');
  return JSON.parse(jsonStr) as ZkpClinicalDocumentProof;
}
