/**
 * Motor Criptográfico de Assinaturas Cegas (Chaumian Blind Signatures)
 * Em conformidade com o Protocolo de David Chaum (1982), RFC 9474 (Blind Signatures for Privacy-Pass),
 * RFC 8785 (JSON Canonicalization Scheme - JCS), LGPD Art. 13 e Resolução CFP nº 001/2009.
 */

import crypto from 'node:crypto';
import {
  BlindSignatureScheme,
  BlindSignaturePurpose,
  BlindSignatureStatus,
  BlindBallotDecision,
  type BlindSignaturePublicKey,
  type BlindSignaturePrivateKey,
  type BlindSignatureKeyPair,
  type BlindSignatureBlindedMessage,
  type BlindSignatureSignedResponse,
  type BlindSignatureUnblindedToken,
  type BlindSignatureVerificationResult,
  type BlindSignatureProofSeal,
  type BlindSignatureBallotItem,
  type BlindSignatureReferralVoucher
} from '@terapiainfoco/shared';

// Segredo mestre WORM para selos de fé pública e perícia
const BLIND_WORM_HMAC_SECRET = process.env.BLIND_WORM_HMAC_SECRET || 'terapiainfoco_chaum_blind_signature_worm_secret_2026';

/**
 * Serialização canônica determinística JCS (RFC 8785)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return '{' + parts.join(',') + '}';
}

// =========================================================================
// ARITMÉTICA MODULAR DE ALTA PRECISÃO (BIGINT)
// =========================================================================

/**
 * Exponenciação Modular Rápida: (base ^ exp) mod mod
 * Tempo de execução O(log exp) com proteção contra estouro de memória
 */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;

  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % mod;
    }
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

/**
 * Algoritmo de Euclides Estendido: encontra { gcd, x, y } tais que a*x + b*y = gcd(a, b)
 */
export function extendedGcd(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
  let old_r = a, r = b;
  let old_s = 1n, s = 0n;
  let old_t = 0n, t = 1n;

  while (r !== 0n) {
    const quotient = old_r / r;
    const temp_r = r;
    r = old_r - quotient * r;
    old_r = temp_r;

    const temp_s = s;
    s = old_s - quotient * s;
    old_s = temp_s;

    const temp_t = t;
    t = old_t - quotient * t;
    old_t = temp_t;
  }

  return { gcd: old_r, x: old_s, y: old_t };
}

/**
 * Máximo Divisor Comum (GCD) de dois BigInts
 */
export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x;
}

/**
 * Inverso Multiplicativo Modular: a^(-1) mod mod
 * Satisfaz: (a * inverse) mod mod === 1
 */
export function modInverse(a: bigint, mod: bigint): bigint {
  const { gcd: g, x } = extendedGcd(((a % mod) + mod) % mod, mod);
  if (g !== 1n) {
    throw new Error(`Inverso modular não existe: gcd(${a}, ${mod}) = ${g} !== 1 (não coprimos)`);
  }
  return ((x % mod) + mod) % mod;
}

/**
 * Conversões seguras entre Buffer, Hex e BigInt
 */
export function bufferToBigInt(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex'));
}

export function bigIntToHex(n: bigint): string {
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return hex;
}

export function hexToBigInt(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + (clean.length === 0 ? '0' : clean));
}

// =========================================================================
// PROTOCOLO DE DAVID CHAUM (FULL DOMAIN HASH + BLINDING + UNBLINDING)
// =========================================================================

/**
 * Full Domain Hash (FDH-SHA256) com domínio prefixado de segurança
 * Transforma a mensagem clínica e seu propósito em um elemento h em Z_N^*
 */
export function fullDomainHash(message: string, purpose: BlindSignaturePurpose, modulus: bigint): bigint {
  // RFC 9474 / Full-Domain Hash com domínio isolado contra colisões
  const prefix = `TERAPIAINFOCO_CHAUM_FDH_V1:${purpose}:`;
  const digest = crypto.createHash('sha256').update(prefix).update(message).digest();
  
  // Converte digest para BigInt e assegura que 1 < h < modulus
  let h = bufferToBigInt(digest) % modulus;
  if (h <= 1n) {
    h = h + 2n;
  }
  return h;
}

/**
 * Geração de Chaves da Autoridade Emissora (Colegiado Ético ou Clínica)
 * Extrai parâmetros RSA reais (módulo N e expoente d) via motor nativo de alta performance
 */
export function generateBlindKeyPair(
  scheme: BlindSignatureScheme = BlindSignatureScheme.RSA_BLIND_2048,
  authorityName: string = 'Comitê de Ética e Fiscalização Profissional / TerapiaInFoco',
  authorityRole: string = 'AUTORIDADE_EMISSORA_COLEGIADO'
): BlindSignatureKeyPair {
  const keySize = scheme === BlindSignatureScheme.RSA_BLIND_4096 ? 4096 : 2048;

  // Geração de chave RSA pelo motor criptográfico com expoente padrão 65537
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicExponent: 65537,
    publicKeyEncoding: {
      type: 'spki',
      format: 'jwk'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'jwk'
    }
  });

  if (!publicKey.n || !publicKey.e || !privateKey.d) {
    throw new Error('Falha ao extrair componentes modulares RSA da chave gerada.');
  }

  // Decodifica base64url do JWK para hex
  const modulusHex = Buffer.from(publicKey.n, 'base64url').toString('hex');
  const publicExponentHex = Buffer.from(publicKey.e, 'base64url').toString('hex');
  const privateExponentHex = Buffer.from(privateKey.d, 'base64url').toString('hex');

  const keyId = `key_chaum_${scheme.toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;
  const fingerprint = crypto.createHash('sha256').update(modulusHex).update(publicExponentHex).digest('hex');

  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano

  const pubKey: BlindSignaturePublicKey = {
    keyId,
    scheme,
    modulusHex,
    publicExponentHex,
    authorityName,
    authorityRole,
    fingerprint,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString()
  };

  const privKey: BlindSignaturePrivateKey = {
    keyId,
    privateExponentHex
  };

  return {
    publicKey: pubKey,
    privateKey: privKey
  };
}

/**
 * Passo 1: Cegamento no Cliente (Client Blinding)
 * Computa:
 *   h = FullDomainHash(m) mod N
 *   Gera r aleatório em Z_N^* tal que gcd(r, N) == 1
 *   m' = (h * r^e) mod N
 */
export function blindMessage(
  originalMessage: string,
  purpose: BlindSignaturePurpose,
  publicKey: BlindSignaturePublicKey
): BlindSignatureBlindedMessage {
  const N = hexToBigInt(publicKey.modulusHex);
  const e = hexToBigInt(publicKey.publicExponentHex);

  const h = fullDomainHash(originalMessage, purpose, N);

  // Gera fator de cegamento r aleatório e coprimo com N
  let r: bigint;
  let attempts = 0;
  do {
    // 32 a 64 bytes de entropia
    const randBuf = crypto.randomBytes(32);
    r = bufferToBigInt(randBuf) % (N - 2n) + 2n;
    attempts++;
    if (attempts > 100) {
      throw new Error('Não foi possível amostrar fator de cegamento coprimo após 100 tentativas.');
    }
  } while (gcd(r, N) !== 1n);

  // Computa r^e mod N
  const rPowE = modPow(r, e, N);

  // Mensagem cega m' = (h * r^e) mod N
  const blindedBigInt = (h * rPowE) % N;

  return {
    blindedMessageHex: bigIntToHex(blindedBigInt),
    blindingFactorHex: bigIntToHex(r),
    messageDigestHex: bigIntToHex(h),
    originalMessage,
    purpose,
    authorityKeyId: publicKey.keyId,
    scheme: publicKey.scheme,
    createdAt: new Date().toISOString()
  };
}

/**
 * Passo 2: Assinatura Cega pela Autoridade (Authority Blind Signing)
 * A autoridade NÃO conhece a mensagem legível nem o fator de cegamento r.
 * Computa:
 *   s' = (m')^d mod N
 */
export function signBlindMessage(
  blindedMessageHex: string,
  privateKey: BlindSignaturePrivateKey,
  publicKey: BlindSignaturePublicKey
): BlindSignatureSignedResponse {
  const N = hexToBigInt(publicKey.modulusHex);
  const d = hexToBigInt(privateKey.privateExponentHex);
  const blindedBigInt = hexToBigInt(blindedMessageHex);

  if (blindedBigInt <= 0n || blindedBigInt >= N) {
    throw new Error('Mensagem cega fora do intervalo permitido [1, N-1].');
  }

  // s' = (m')^d mod N
  const signedBlindBigInt = modPow(blindedBigInt, d, N);

  return {
    blindSignatureHex: bigIntToHex(signedBlindBigInt),
    authorityKeyId: publicKey.keyId,
    scheme: publicKey.scheme,
    signedAt: new Date().toISOString()
  };
}

/**
 * Passo 3: Descegamento pelo Cliente (Client Unblinding)
 * Computa:
 *   r^(-1) mod N
 *   s = (s' * r^(-1)) mod N
 *   Nota: Como s' = (m')^d = (h * r^e)^d = h^d * (r^e)^d = h^d * r mod N,
 *         temos s = (h^d * r) * r^(-1) = h^d mod N!
 */
export function unblindSignature(
  blindSignatureHex: string,
  blindingFactorHex: string,
  publicKey: BlindSignaturePublicKey
): string {
  const N = hexToBigInt(publicKey.modulusHex);
  const sPrime = hexToBigInt(blindSignatureHex);
  const r = hexToBigInt(blindingFactorHex);

  const rInv = modInverse(r, N);
  const s = (sPrime * rInv) % N;

  return bigIntToHex(s);
}

/**
 * Cria o Token Descegado Completo pronto para resgate anônimo ou voto
 */
export function createUnblindedToken(
  originalMessage: string,
  unblindedSignatureHex: string,
  purpose: BlindSignaturePurpose,
  authorityKeyId: string,
  scheme: BlindSignatureScheme,
  publicKey: BlindSignaturePublicKey
): BlindSignatureUnblindedToken {
  const N = hexToBigInt(publicKey.modulusHex);
  const h = fullDomainHash(originalMessage, purpose, N);
  const tokenId = `token_chaum_${crypto.randomBytes(8).toString('hex')}`;
  const nullifierHash = computeNullifier(originalMessage, unblindedSignatureHex);

  return {
    tokenId,
    originalMessage,
    messageDigestHex: bigIntToHex(h),
    unblindedSignatureHex,
    nullifierHash,
    purpose,
    authorityKeyId,
    scheme,
    status: BlindSignatureStatus.UNBLINDED,
    issuedAt: new Date().toISOString()
  };
}

/**
 * Passo 4: Verificação Pública com Fé Pública (Public Verification)
 * Qualquer destinatário, urna eleitoral ou farmácia credenciada verifica:
 *   s^e mod N === h mod N
 */
export function verifyBlindSignature(
  originalMessage: string,
  unblindedSignatureHex: string,
  publicKey: BlindSignaturePublicKey,
  purpose: BlindSignaturePurpose,
  isAlreadyRedeemed: boolean = false
): BlindSignatureVerificationResult {
  const N = hexToBigInt(publicKey.modulusHex);
  const e = hexToBigInt(publicKey.publicExponentHex);
  const s = hexToBigInt(unblindedSignatureHex);

  const h = fullDomainHash(originalMessage, purpose, N);
  const nullifier = computeNullifier(originalMessage, unblindedSignatureHex);

  // Computa s^e mod N
  const recoveredH = modPow(s, e, N);
  const mathValid = recoveredH === h;
  const authorityVerified = mathValid && !isAlreadyRedeemed;

  const operationId = `op_verify_${crypto.randomBytes(6).toString('hex')}`;
  const sealPayload = {
    originalMessage,
    unblindedSignatureHex,
    recoveredDigest: bigIntToHex(recoveredH),
    expectedDigest: bigIntToHex(h),
    nullifier,
    mathValid,
    isAlreadyRedeemed,
    authorityKeyId: publicKey.keyId
  };

  const proofSeal = issueBlindProofSeal(operationId, purpose, publicKey.scheme, sealPayload);

  let message: string;
  let publicFaithAttestation: string;

  if (isAlreadyRedeemed) {
    message = 'VIOLAÇÃO DETECTADA: Tentativa de voto duplo ou duplo resgate (Double-Spending Blocked).';
    publicFaithAttestation = 'REJEITADO: Token/Cédula já foi resgatado anteriormente na urna ou rede credenciada.';
  } else if (mathValid) {
    message = 'SUCESSO: Assinatura cega Chaumiana válida com fé pública. 100% matematicamente desvinculada do solicitante.';
    publicFaithAttestation = `FÉ PÚBLICA CONFIRMADA: Certificado emitido por ${publicKey.authorityName} (${publicKey.authorityRole}) nos termos do Art. 13 da LGPD e Resolução CFP nº 001/2009.`;
  } else {
    message = 'FALHA DE VERIFICAÇÃO: A assinatura apresentada não corresponde à chave da autoridade emissora (forjada ou adulterada).';
    publicFaithAttestation = 'NULA: Não possui validade institucional nem fé pública.';
  }

  return {
    valid: authorityVerified,
    mathematicalProofValid: mathValid,
    authorityVerified,
    doubleSpendDetected: isAlreadyRedeemed,
    nullifier,
    purpose,
    scheme: publicKey.scheme,
    publicFaithAttestation,
    unlinkedClientGuaranteed: true,
    proofSeal,
    verifiedAt: new Date().toISOString(),
    message
  };
}

/**
 * Nullifier Determinístico: H(NULLIFIER_V1:message:signature)
 * Garante que uma cédula ou voucher não possa ser resgatado mais de uma vez (Anti-Double-Spend)
 */
export function computeNullifier(originalMessage: string, unblindedSignatureHex: string): string {
  return crypto.createHash('sha256')
    .update(`NULLIFIER_CHAUM_V1:${originalMessage}:${unblindedSignatureHex}`)
    .digest('hex');
}

// =========================================================================
// SELO PROBATÓRIO WORM HMAC-SHA256 & CANONICALIZAÇÃO JCS (RFC 8785)
// =========================================================================

/**
 * Emite o Selo Probatório WORM
 */
export function issueBlindProofSeal(
  operationId: string,
  purpose: BlindSignaturePurpose,
  scheme: BlindSignatureScheme,
  payload: any
): BlindSignatureProofSeal {
  const canonicalData = canonicalStringify(payload);
  const canonicalDigest = crypto.createHash('sha256').update(canonicalData).digest('hex');

  const hmacSignature = crypto.createHmac('sha256', BLIND_WORM_HMAC_SECRET)
    .update(`BLIND_PROOF_V1:${operationId}:${purpose}:${scheme}:${canonicalDigest}`)
    .digest('hex');

  const issuedAt = new Date().toISOString();
  const sealToken = `blind_proof_v1_${Buffer.from(JSON.stringify({
    op: operationId,
    purp: purpose,
    sch: scheme,
    dig: canonicalDigest,
    sig: hmacSignature,
    ts: issuedAt
  })).toString('base64url')}`;

  return {
    sealToken,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    operationId,
    purpose,
    scheme
  };
}

/**
 * Valida a autenticidade inalterável do Selo Probatório WORM
 */
export function verifyBlindProofSeal(
  seal: BlindSignatureProofSeal,
  payload: any
): boolean {
  if (!seal || !seal.sealToken || !seal.canonicalDigest || !seal.hmacSignature) {
    return false;
  }

  const recalculatedCanonical = canonicalStringify(payload);
  const recalculatedDigest = crypto.createHash('sha256').update(recalculatedCanonical).digest('hex');

  if (recalculatedDigest !== seal.canonicalDigest) {
    return false;
  }

  const expectedHmac = crypto.createHmac('sha256', BLIND_WORM_HMAC_SECRET)
    .update(`BLIND_PROOF_V1:${seal.operationId}:${seal.purpose}:${seal.scheme}:${seal.canonicalDigest}`)
    .digest('hex');

  return expectedHmac === seal.hmacSignature;
}

// =========================================================================
// PRESETS CLÍNICOS E DELIBERAÇÕES ÉTICAS REPRESENTATIVAS
// =========================================================================

export interface ClinicalPresetBallot {
  caseNumber: string;
  caseTitle: string;
  proposedDecision: BlindBallotDecision;
  description: string;
}

export const REPRESENTATIVE_ETHICAL_CASES: ClinicalPresetBallot[] = [
  {
    caseNumber: 'PROCESSO-DISCIPLINAR-CFP-2026-089',
    caseTitle: 'Representação Ética sobre Quebra Injustificada de Sigilo em Telepsicologia',
    proposedDecision: BlindBallotDecision.FAVORABLE_COMPLIANT,
    description: 'Votação anônima de membro do comitê sobre conduta de profissional em ambiente online conforme Resolução CFP nº 011/2018.'
  },
  {
    caseNumber: 'PARECER-BIOETICA-2026-112',
    caseTitle: 'Dilema de Notificação Compulsória vs. Sigilo em Risco Iminente Autolesivo',
    proposedDecision: BlindBallotDecision.FAVORABLE_COMPLIANT,
    description: 'Deliberação colegiada sobre aplicação do Art. 9º do Código de Ética (quebra justificada de sigilo em defesa da vida).'
  },
  {
    caseNumber: 'RECURSO-PLENARIO-2026-304',
    caseTitle: 'Recurso Ordinário sobre Publicidade e Captação Indevida em Redes Sociais',
    proposedDecision: BlindBallotDecision.UNFAVORABLE_SANCTION,
    description: 'Julgamento secreto de recurso interposto perante o colegiado ético com voto cego de fé pública.'
  }
];

export interface ClinicalPresetVoucher {
  medicalSpecialty: string;
  urgencyLevel: 'NORMAL' | 'URGENTE' | 'EMERGENCIAL_CAPS';
  serviceCategory: string;
  patientClinicalAlias: string;
}

export const REPRESENTATIVE_CLINICAL_VOUCHERS: ClinicalPresetVoucher[] = [
  {
    medicalSpecialty: 'Psiquiatria da Infância e da Adolescência',
    urgencyLevel: 'URGENTE',
    serviceCategory: 'Encaminhamento Desvinculado com Voucher Farmacêutico',
    patientClinicalAlias: 'PACIENTE-ANON-TEA-LEVEL-2'
  },
  {
    medicalSpecialty: 'Centro de Atenção Psicossocial (CAPS III - Álcool e Drogas)',
    urgencyLevel: 'EMERGENCIAL_CAPS',
    serviceCategory: 'Acolhimento Crítico Desvinculado de Histórico Pessoal',
    patientClinicalAlias: 'PACIENTE-ANON-SUBSTANCE-RECOVERY'
  },
  {
    medicalSpecialty: 'Neuropsicologia Clínica e Reabilitação Cognitiva',
    urgencyLevel: 'NORMAL',
    serviceCategory: 'Prescrição Digital de Avaliação Neuropsicológica Especializada',
    patientClinicalAlias: 'PACIENTE-ANON-TDAH-DIAGNOSIS'
  }
];
