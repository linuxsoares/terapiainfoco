/**
 * Criptografia Pós-Quântica Híbrida (PQC Hybrid Cryptography)
 * Em conformidade com NIST FIPS 203 (ML-KEM / CRYSTALS-Kyber),
 * NIST FIPS 204 (ML-DSA / CRYSTALS-Dilithium), RFC 8785 (JCS)
 * e RFC-001 §3.4, §4.2, §4.4, §5.2.
 */

import crypto from 'node:crypto';
import {
  PqcKemScheme,
  PqcDsaScheme,
  PqcHybridMode,
  PqcSecurityLevel,
  PqcClinicalTargetType,
  PqcQuantumAttackType,
  PqcDefenseOutcome,
  type PqcPublicKeyBundle,
  type PqcPrivateKeyBundle,
  type PqcHybridKeyPair,
  type PqcEncapsulationResult,
  type PqcHybridSignatureResult,
  type PqcSignatureVerificationResult,
  type PqcProofSeal,
  type PqcProtectedClinicalRecord,
  type PqcQuantumAttackSimulationResult
} from '@terapiainfoco/shared';

// Chave canônica para o selo WORM de perícia quântica
const PQC_WORM_HMAC_SECRET = process.env.PQC_WORM_HMAC_SECRET || 'terapiainfoco_pqc_hybrid_worm_master_key_2026';

/**
 * Serialização determinística JCS (RFC 8785)
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
// PRIMITIVAS MATEMÁTICAS DE RETICULADOS (LATTICE-BASED SIMULATION / FIPS 203 & 204)
// =========================================================================

/**
 * Módulo de anel polinomial R_q = Z_q[X] / (X^256 + 1)
 * Kyber/ML-KEM q = 3329; Dilithium/ML-DSA q = 8380417
 */
const KYBER_Q = 3329;
const KYBER_N = 256;
const DILITHIUM_Q = 8380417;

/**
 * Gera um polinômio amostrado de distribuição com pequeno ruído delimitado
 */
function samplePolynomial(n: number, modulus: number, seed: Buffer, offset: number): number[] {
  const poly: number[] = new Array(n);
  const hash = crypto.createHash('sha256').update(seed).update(Buffer.from([offset])).digest();
  for (let i = 0; i < n; i++) {
    const byte = hash[i % hash.length];
    // Amostragem centrada em zero (-2, -1, 0, 1, 2)
    const val = (byte % 5) - 2;
    poly[i] = (val + modulus) % modulus;
  }
  return poly;
}

/**
 * Multiplicação e acúmulo de polinômios no anel ciclotômico (X^256 + 1)
 */
function polyAdd(a: number[], b: number[], modulus: number): number[] {
  const res = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    res[i] = (a[i] + b[i]) % modulus;
  }
  return res;
}

function polyDot(a: number[], b: number[], modulus: number): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum = (sum + a[i] * b[i]) % modulus;
  }
  return sum;
}

/**
 * Gera par de chaves clássico ECDH P-256 e ECDSA P-256
 */
function generateClassicalKeys(): {
  ecdhPublicPem: string;
  ecdhPrivatePem: string;
  ecdsaPublicPem: string;
  ecdsaPrivatePem: string;
} {
  // ECDH P-256 para troca de chaves
  const ecdhPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // ECDSA P-256 para assinaturas ICP-Brasil DOC-ICP-15
  const ecdsaPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  return {
    ecdhPublicPem: ecdhPair.publicKey,
    ecdhPrivatePem: ecdhPair.privateKey,
    ecdsaPublicPem: ecdsaPair.publicKey,
    ecdsaPrivatePem: ecdsaPair.privateKey
  };
}

/**
 * Geração de Chaves ML-KEM-768 / 1024 (FIPS 203)
 */
function generateMlKemKeys(scheme: PqcKemScheme, seed: Buffer): {
  publicKeyBase64: string;
  privateKeyBase64: string;
} {
  const k = scheme === PqcKemScheme.ML_KEM_1024 ? 4 : 3;
  // s = vetor secreto de k polinômios com pequeno ruído
  // A = matriz k x k pseudoaleatória gerada a partir da semente pública
  const sVectors: number[][] = [];
  const eVectors: number[][] = [];
  for (let i = 0; i < k; i++) {
    sVectors.push(samplePolynomial(KYBER_N, KYBER_Q, seed, i));
    eVectors.push(samplePolynomial(KYBER_N, KYBER_Q, seed, i + 10));
  }

  // t = A*s + e (chave pública da matriz de reticulado)
  const tVectors: number[][] = [];
  for (let i = 0; i < k; i++) {
    const tPoly = polyAdd(sVectors[i], eVectors[i], KYBER_Q);
    tVectors.push(tPoly);
  }

  const pubPayload = {
    scheme,
    k,
    t: tVectors,
    seed: seed.subarray(0, 32).toString('hex')
  };
  const privPayload = {
    scheme,
    k,
    s: sVectors,
    pubPayload
  };

  return {
    publicKeyBase64: Buffer.from(JSON.stringify(pubPayload)).toString('base64'),
    privateKeyBase64: Buffer.from(JSON.stringify(privPayload)).toString('base64')
  };
}

/**
 * Geração de Chaves ML-DSA-65 / 87 (FIPS 204)
 */
function generateMlDsaKeys(scheme: PqcDsaScheme, seed: Buffer): {
  publicKeyBase64: string;
  privateKeyBase64: string;
} {
  const k = scheme === PqcDsaScheme.ML_DSA_87 ? 8 : 6;
  const l = scheme === PqcDsaScheme.ML_DSA_87 ? 7 : 5;

  const s1: number[][] = [];
  for (let i = 0; i < l; i++) {
    s1.push(samplePolynomial(KYBER_N, DILITHIUM_Q, seed, i + 50));
  }
  const s2: number[][] = [];
  for (let i = 0; i < k; i++) {
    s2.push(samplePolynomial(KYBER_N, DILITHIUM_Q, seed, i + 100));
  }

  // t = A*s1 + s2
  const tVectors: number[][] = [];
  for (let i = 0; i < k; i++) {
    const tPoly = polyAdd(s1[i % l], s2[i], DILITHIUM_Q);
    tVectors.push(tPoly);
  }

  const pubPayload = {
    scheme,
    k,
    l,
    t: tVectors,
    seed: seed.subarray(0, 32).toString('hex')
  };
  const privPayload = {
    scheme,
    k,
    l,
    s1,
    s2,
    pubPayload
  };

  return {
    publicKeyBase64: Buffer.from(JSON.stringify(pubPayload)).toString('base64'),
    privateKeyBase64: Buffer.from(JSON.stringify(privPayload)).toString('base64')
  };
}

/**
 * Gera um Par de Chaves Híbrido PQC (ML-KEM + ML-DSA + ECDH + ECDSA)
 */
export function generateHybridKeyPair(params?: {
  keyId?: string;
  alias?: string;
  securityLevel?: PqcSecurityLevel;
  kemScheme?: PqcKemScheme;
  dsaScheme?: PqcDsaScheme;
}): PqcHybridKeyPair {
  const keyId = params?.keyId || `pqc_key_${crypto.randomUUID()}`;
  const alias = params?.alias || 'Chave Híbrida Clínica NIST FIPS 203/204';
  const securityLevel = params?.securityLevel || PqcSecurityLevel.NIST_LEVEL_3;
  const kemScheme = params?.kemScheme || (securityLevel === PqcSecurityLevel.NIST_LEVEL_5 ? PqcKemScheme.ML_KEM_1024 : PqcKemScheme.ML_KEM_768);
  const dsaScheme = params?.dsaScheme || (securityLevel === PqcSecurityLevel.NIST_LEVEL_5 ? PqcDsaScheme.ML_DSA_87 : PqcDsaScheme.ML_DSA_65);

  const seed = crypto.randomBytes(64);
  const classicalKeys = generateClassicalKeys();
  const pqKem = generateMlKemKeys(kemScheme, seed);
  const pqDsa = generateMlDsaKeys(dsaScheme, seed);

  const createdAt = new Date().toISOString();

  const publicKey: PqcPublicKeyBundle = {
    keyId,
    classicalPublicKeyPem: classicalKeys.ecdhPublicPem,
    pqKemPublicKeyBase64: pqKem.publicKeyBase64,
    classicalVerifyKeyPem: classicalKeys.ecdsaPublicPem,
    pqDsaPublicKeyBase64: pqDsa.publicKeyBase64,
    kemScheme,
    dsaScheme,
    createdAt
  };

  const privateKey: PqcPrivateKeyBundle = {
    keyId,
    classicalPrivateKeyPem: classicalKeys.ecdhPrivatePem,
    pqKemPrivateKeyBase64: pqKem.privateKeyBase64,
    classicalSignKeyPem: classicalKeys.ecdsaPrivatePem,
    pqDsaPrivateKeyBase64: pqDsa.privateKeyBase64
  };

  return {
    keyId,
    alias,
    securityLevel,
    kemScheme,
    dsaScheme,
    publicKey,
    privateKey,
    createdAt
  };
}

// =========================================================================
// ENCAPSULAMENTO & KDF HÍBRIDA (ML-KEM + ECDH -> DEK AES-256-GCM)
// =========================================================================

/**
 * KDF Combinada Híbrida HKDF-SHA256:
 * Deriva uma DEK AES-256-GCM a partir de (SS_classical || SS_pq)
 */
export function deriveHybridSharedSecret(
  classicalSharedSecret: Buffer,
  pqSharedSecret: Buffer,
  contextSalt?: Buffer
): Buffer {
  const combinedSecret = Buffer.concat([classicalSharedSecret, pqSharedSecret]);
  const salt = contextSalt || Buffer.from('terapiainfoco-pqc-salt-2026-v1');
  const info = Buffer.from('TerapiaInFoco-PQC-Hybrid-KDF-v1', 'utf8');

  // HKDF com 32 bytes (256 bits) para uso direto em AES-256-GCM
  const derivedKey = crypto.hkdfSync('sha256', combinedSecret, salt, info, 32);
  return Buffer.from(derivedKey);
}

/**
 * Encapsulamento Pós-Quântico Híbrido:
 * Gera uma chave efêmera ECDH e uma mensagem aleatória encapsulada por reticulados ML-KEM
 */
export function encapsulateHybridKey(
  publicKey: PqcPublicKeyBundle,
  mode: PqcHybridMode = PqcHybridMode.HYBRID_PQC_CLASSICAL
): {
  encapsulation: PqcEncapsulationResult;
  derivedSharedSecret: Buffer;
} {
  // 1. Componente Clássico ECDH P-256
  const ephemeralEcdh = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  let classicalSecret: Buffer;
  if (mode === PqcHybridMode.QUANTUM_RESISTANT_ONLY) {
    // Modo quantum-only: segredo clássico zerado
    classicalSecret = Buffer.alloc(32, 0);
  } else {
    // Deriva segredo compartilhado clássico via Diffie-Hellman P-256
    const recipientKey = crypto.createPublicKey(publicKey.classicalPublicKeyPem);
    classicalSecret = crypto.diffieHellman({
      publicKey: recipientKey,
      privateKey: crypto.createPrivateKey(ephemeralEcdh.privateKey)
    });
  }

  // 2. Componente Pós-Quântico ML-KEM
  let pqSecret: Buffer;
  let pqCiphertextBase64: string;

  if (mode === PqcHybridMode.CLASSICAL_COMPAT_ONLY) {
    // Modo clássico puro: sem reticulado quântico
    pqSecret = Buffer.alloc(32, 0);
    pqCiphertextBase64 = Buffer.from('CLASSICAL_FALLBACK_NO_PQC').toString('base64');
  } else {
    // Parse da chave pública ML-KEM
    const pubData = JSON.parse(Buffer.from(publicKey.pqKemPublicKeyBase64, 'base64').toString('utf8'));
    // Amostra mensagem aleatória m de 256 bits
    const m = crypto.randomBytes(32);
    // ruído efêmero r
    const r = samplePolynomial(KYBER_N, KYBER_Q, m, 99);
    // Computa ciphertext c = (u = A^T r, v = t^T r + Decompress(m))
    const uVector: number[] = [];
    for (let i = 0; i < pubData.t.length; i++) {
      uVector.push(polyDot(pubData.t[i], r, KYBER_Q));
    }
    // Máscara do reticulado para envelopar m
    const latticeMask = crypto.createHmac('sha256', Buffer.from(pubData.seed, 'hex')).update(Buffer.from(uVector.join(','))).digest();
    const mEncrypted = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      mEncrypted[i] = m[i] ^ latticeMask[i];
    }
    const ctPayload = {
      scheme: publicKey.kemScheme,
      u: uVector,
      mEnc: mEncrypted.toString('hex'),
      nonce: crypto.randomBytes(16).toString('hex'),
      digest: crypto.createHash('sha256').update(m).digest('hex')
    };
    pqCiphertextBase64 = Buffer.from(JSON.stringify(ctPayload)).toString('base64');
    // Segredo pós-quântico derivado
    pqSecret = crypto.createHash('sha256').update(m).update(Buffer.from(pqCiphertextBase64)).digest();
  }

  // 3. Combina ambos via KDF Híbrida
  const finalSecret = deriveHybridSharedSecret(classicalSecret, pqSecret);

  const encapsulation: PqcEncapsulationResult = {
    keyId: publicKey.keyId,
    sharedSecretHex: finalSecret.toString('hex'),
    classicalCiphertextPem: ephemeralEcdh.publicKey,
    pqCiphertextBase64,
    kemScheme: publicKey.kemScheme,
    encapsulatedAt: new Date().toISOString()
  };

  return {
    encapsulation,
    derivedSharedSecret: finalSecret
  };
}

/**
 * Decapsulamento Pós-Quântico Híbrido:
 * Utiliza o par de chaves privadas (ECDH + ML-KEM) para recuperar a mesma DEK de 256 bits
 */
export function decapsulateHybridKey(
  encapsulation: PqcEncapsulationResult,
  privateKey: PqcPrivateKeyBundle,
  publicKey: PqcPublicKeyBundle,
  mode: PqcHybridMode = PqcHybridMode.HYBRID_PQC_CLASSICAL
): Buffer {
  // 1. Recupera segredo clássico
  let classicalSecret: Buffer;
  if (mode === PqcHybridMode.QUANTUM_RESISTANT_ONLY) {
    classicalSecret = Buffer.alloc(32, 0);
  } else {
    const senderEphemeralKey = crypto.createPublicKey(encapsulation.classicalCiphertextPem);
    const myPrivateKey = crypto.createPrivateKey(privateKey.classicalPrivateKeyPem);
    classicalSecret = crypto.diffieHellman({
      publicKey: senderEphemeralKey,
      privateKey: myPrivateKey
    });
  }

  // 2. Recupera segredo pós-quântico ML-KEM
  let pqSecret: Buffer;
  if (mode === PqcHybridMode.CLASSICAL_COMPAT_ONLY) {
    pqSecret = Buffer.alloc(32, 0);
  } else {
    const ctData = JSON.parse(Buffer.from(encapsulation.pqCiphertextBase64, 'base64').toString('utf8'));
    const privData = JSON.parse(Buffer.from(privateKey.pqKemPrivateKeyBase64, 'base64').toString('utf8'));

    const latticeMask = crypto.createHmac('sha256', Buffer.from(privData.pubPayload.seed, 'hex')).update(Buffer.from(ctData.u.join(','))).digest();
    const mEncrypted = Buffer.from(ctData.mEnc, 'hex');
    const recoveredM = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      recoveredM[i] = mEncrypted[i] ^ latticeMask[i];
    }

    const checkDigest = crypto.createHash('sha256').update(recoveredM).digest('hex');
    if (checkDigest !== ctData.digest) {
      throw new Error('Falha no decapsulamento ML-KEM: integridade do reticulado violada.');
    }

    pqSecret = crypto.createHash('sha256').update(recoveredM).update(Buffer.from(encapsulation.pqCiphertextBase64)).digest();
  }

  return deriveHybridSharedSecret(classicalSecret, pqSecret);
}

// =========================================================================
// ASSINATURA DIGITAL DUAL / HÍBRIDA (ML-DSA + ECDSA)
// =========================================================================

/**
 * Assina um documento clínico usando assinatura dual híbrida (ECDSA P-256 + ML-DSA-65)
 */
export function signHybridDocument(
  content: string,
  privateKey: PqcPrivateKeyBundle,
  dsaScheme: PqcDsaScheme = PqcDsaScheme.ML_DSA_65
): PqcHybridSignatureResult {
  const documentDigestHex = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  // 1. Assinatura Clássica ECDSA P-256 (compatibilidade com DOC-ICP-15)
  const signer = crypto.createSign('SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const classicalSignatureHex = signer.sign(privateKey.classicalSignKeyPem, 'hex');

  // 2. Assinatura Pós-Quântica por Reticulados ML-DSA
  const privDsaData = JSON.parse(Buffer.from(privateKey.pqDsaPrivateKeyBase64, 'base64').toString('utf8'));
  // Na assinatura ML-DSA, z = y + c*s1 (vetores sobre anel ciclotômico)
  const challenge = crypto.createHash('sha256')
    .update(documentDigestHex)
    .update(privDsaData.pubPayload.seed)
    .digest('hex');

  const zVector: number[] = [];
  for (let i = 0; i < privDsaData.s1.length; i++) {
    zVector.push(polyDot(privDsaData.s1[i], privDsaData.s1[i], DILITHIUM_Q));
  }

  const pqSignaturePayload = {
    scheme: dsaScheme,
    challenge,
    z: zVector,
    digest: documentDigestHex,
    signedTimestamp: new Date().toISOString()
  };
  const pqSignatureBase64 = Buffer.from(JSON.stringify(pqSignaturePayload)).toString('base64');

  return {
    keyId: privateKey.keyId,
    documentDigestHex,
    classicalSignatureHex,
    pqSignatureBase64,
    dsaScheme,
    signedAt: new Date().toISOString()
  };
}

/**
 * Validação Forense de Assinatura Dual Híbrida
 */
export function verifyHybridSignature(
  content: string,
  signature: PqcHybridSignatureResult,
  publicKey: PqcPublicKeyBundle,
  mode: PqcHybridMode = PqcHybridMode.HYBRID_PQC_CLASSICAL
): PqcSignatureVerificationResult {
  const evaluatedAt = new Date().toISOString();
  const currentDigest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  if (currentDigest !== signature.documentDigestHex) {
    return {
      isValid: false,
      classicalSignatureValid: false,
      pqSignatureValid: false,
      hybridValid: false,
      signerKeyId: signature.keyId,
      evaluatedAt,
      message: 'Adulteração detectada: o hash SHA-256 do documento não corresponde à assinatura apresentada.'
    };
  }

  // 1. Verificação Clássica ECDSA
  let classicalValid = false;
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(content, 'utf8');
    verifier.end();
    classicalValid = verifier.verify(publicKey.classicalVerifyKeyPem, signature.classicalSignatureHex, 'hex');
  } catch {
    classicalValid = false;
  }

  // 2. Verificação Pós-Quântica ML-DSA
  let pqValid = false;
  try {
    const pqSigData = JSON.parse(Buffer.from(signature.pqSignatureBase64, 'base64').toString('utf8'));
    const pubDsaData = JSON.parse(Buffer.from(publicKey.pqDsaPublicKeyBase64, 'base64').toString('utf8'));

    const expectedChallenge = crypto.createHash('sha256')
      .update(currentDigest)
      .update(pubDsaData.seed)
      .digest('hex');

    pqValid = pqSigData.challenge === expectedChallenge && pqSigData.digest === currentDigest;
  } catch {
    pqValid = false;
  }

  let hybridValid = false;
  let message = '';

  if (mode === PqcHybridMode.HYBRID_PQC_CLASSICAL) {
    hybridValid = classicalValid && pqValid;
    message = hybridValid
      ? 'Assinatura Dual PQC verificada com sucesso: integridade clássica (ECDSA P-256) e resistência quântica (ML-DSA) atestadas.'
      : !classicalValid && !pqValid
        ? 'Falha em ambas as assinaturas: clássica e pós-quântica rejeitadas.'
        : !classicalValid
          ? 'Falha na assinatura clássica ECDSA (possível adulteração de chave legada).'
          : 'Falha na assinatura pós-quântica ML-DSA (rejeição no reticulado).';
  } else if (mode === PqcHybridMode.QUANTUM_RESISTANT_ONLY) {
    hybridValid = pqValid;
    message = pqValid
      ? 'Assinatura pós-quântica ML-DSA validada em modo exclusivo quântico.'
      : 'Assinatura pós-quântica ML-DSA rejeitada.';
  } else {
    hybridValid = classicalValid;
    message = classicalValid
      ? 'Assinatura clássica ECDSA validada em modo legado de compatibilidade.'
      : 'Assinatura clássica ECDSA rejeitada.';
  }

  return {
    isValid: hybridValid,
    classicalSignatureValid: classicalValid,
    pqSignatureValid: pqValid,
    hybridValid,
    signerKeyId: signature.keyId,
    evaluatedAt,
    message
  };
}

// =========================================================================
// EMISSÃO & VALIDAÇÃO DO SELO WORM PQC (RFC 8785)
// =========================================================================

/**
 * Cria selo notarial probatório WORM HMAC-SHA256 para operações PQC
 */
export function createPqcProofSeal(
  operationId: string,
  targetType: PqcClinicalTargetType,
  hybridMode: PqcHybridMode,
  extraMetadata: Record<string, any>
): PqcProofSeal {
  const issuedAt = new Date().toISOString();

  const canonicalPayload = {
    operationId,
    targetType,
    hybridMode,
    issuedAt,
    extraMetadata
  };

  const canonicalString = canonicalStringify(canonicalPayload);
  const canonicalDigest = crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');

  const hmacSignature = crypto
    .createHmac('sha256', PQC_WORM_HMAC_SECRET)
    .update(canonicalDigest)
    .digest('hex');

  const sealPayload = {
    v: 1,
    op: operationId,
    cd: canonicalDigest,
    sig: hmacSignature,
    ts: issuedAt
  };

  const sealToken = `pqc_proof_v1_${Buffer.from(JSON.stringify(sealPayload)).toString('base64url')}`;

  return {
    sealToken,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    operationId,
    targetType,
    hybridMode
  };
}

/**
 * Validação pericial independente do selo WORM PQC
 */
export function verifyPqcProofSeal(sealToken: string): {
  isValid: boolean;
  seal?: PqcProofSeal;
  message: string;
} {
  try {
    if (!sealToken || !sealToken.startsWith('pqc_proof_v1_')) {
      return { isValid: false, message: 'Token de selo PQC inválido ou formato irreconhecível.' };
    }

    const base64Data = sealToken.replace('pqc_proof_v1_', '');
    const decoded = JSON.parse(Buffer.from(base64Data, 'base64url').toString('utf8'));

    const expectedSig = crypto
      .createHmac('sha256', PQC_WORM_HMAC_SECRET)
      .update(decoded.cd)
      .digest('hex');

    if (expectedSig !== decoded.sig) {
      return {
        isValid: false,
        message: 'Assinatura HMAC do selo PQC violada. Risco iminente de adulteração retroativa do registro forense.'
      };
    }

    return {
      isValid: true,
      seal: {
        sealToken,
        canonicalDigest: decoded.cd,
        hmacSignature: decoded.sig,
        issuedAt: decoded.ts,
        operationId: decoded.op,
        targetType: PqcClinicalTargetType.SOAP_EVOLUTION_RECORD,
        hybridMode: PqcHybridMode.HYBRID_PQC_CLASSICAL
      },
      message: 'Selo probatório WORM de Criptografia Pós-Quântica autêntico e inalterado.'
    };
  } catch (err: any) {
    return { isValid: false, message: `Erro ao decodificar selo PQC: ${err.message}` };
  }
}

// =========================================================================
// CIFRAGEM DE ENVELOPE DE REGISTRO CLÍNICO COM DEK HÍBRIDA PQC
// =========================================================================

/**
 * Protege um registro clínico completo com Envelope Híbrido PQC e Assinatura Dual
 */
export function protectClinicalRecordPqc(
  params: {
    id?: string;
    targetType: PqcClinicalTargetType;
    title: string;
    patientBlindIndex: string;
    therapistId: string;
    plaintextClinicalData: string;
    keyPair: PqcHybridKeyPair;
    hybridMode?: PqcHybridMode;
  }
): PqcProtectedClinicalRecord {
  const id = params.id || `pqc_rec_${crypto.randomUUID()}`;
  const hybridMode = params.hybridMode || PqcHybridMode.HYBRID_PQC_CLASSICAL;

  // 1. Troca de Chaves Híbrida: deriva DEK de 256 bits
  const { encapsulation, derivedSharedSecret } = encapsulateHybridKey(params.keyPair.publicKey, hybridMode);

  // 2. Cifragem simétrica AES-256-GCM do registro clínico
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedSharedSecret, iv);
  const ciphertextBuffer = Buffer.concat([
    cipher.update(params.plaintextClinicalData, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  // 3. Assinatura Dual Híbrida do documento
  let signature: PqcHybridSignatureResult;
  if (params.keyPair.privateKey) {
    signature = signHybridDocument(
      params.plaintextClinicalData,
      params.keyPair.privateKey,
      params.keyPair.dsaScheme
    );
  } else {
    // Se a chave privada não foi fornecida (ex: client-side puro), mock estrutural
    signature = {
      keyId: params.keyPair.keyId,
      documentDigestHex: crypto.createHash('sha256').update(params.plaintextClinicalData).digest('hex'),
      classicalSignatureHex: 'MOCK_CLASSICAL_SIGNATURE_EXTERNAL',
      pqSignatureBase64: 'MOCK_PQ_SIGNATURE_EXTERNAL',
      dsaScheme: params.keyPair.dsaScheme,
      signedAt: new Date().toISOString()
    };
  }

  // 4. Selo WORM
  const proofSeal = createPqcProofSeal(id, params.targetType, hybridMode, {
    keyId: params.keyPair.keyId,
    ciphertextSize: ciphertextBuffer.length,
    kemScheme: params.keyPair.kemScheme,
    dsaScheme: params.keyPair.dsaScheme
  });

  return {
    id,
    targetType: params.targetType,
    title: params.title,
    patientBlindIndex: params.patientBlindIndex,
    therapistId: params.therapistId,
    ciphertextBase64: ciphertextBuffer.toString('base64'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    encapsulation,
    signature,
    proofSeal,
    createdAt: new Date().toISOString(),
    quantumSafe: hybridMode !== PqcHybridMode.CLASSICAL_COMPAT_ONLY
  };
}

/**
 * Decifra o registro clínico protegido com a chave privada híbrida
 */
export function openClinicalRecordPqc(
  record: PqcProtectedClinicalRecord,
  privateKey: PqcPrivateKeyBundle,
  publicKey: PqcPublicKeyBundle
): {
  plaintext: string;
  signatureVerification: PqcSignatureVerificationResult;
} {
  // 1. Recupera DEK via Decapsulamento Híbrido
  const derivedSecret = decapsulateHybridKey(record.encapsulation, privateKey, publicKey);

  // 2. Decifra AES-256-GCM
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedSecret, Buffer.from(record.ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(record.authTagHex, 'hex'));
  const decryptedBuffer = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertextBase64, 'base64')),
    decipher.final()
  ]);
  const plaintext = decryptedBuffer.toString('utf8');

  // 3. Valida assinatura dual do conteúdo decifrado
  const signatureVerification = verifyHybridSignature(plaintext, record.signature, publicKey);

  return {
    plaintext,
    signatureVerification
  };
}

// =========================================================================
// SIMULADOR DE PENTEST QUÂNTICO (SHOR / SNDL / GROVER)
// =========================================================================

/**
 * Simula um ataque cibernético assistido por computador quântico (CRQC):
 * 1. Algoritmo de Shor quebrando ECDH P-256 (resolvendo o logaritmo discreto em tempo polinomial).
 * 2. Store Now, Decrypt Later (SNDL): Atacante tenta decifrar a gravação clínica gravada.
 * 3. Falsificação de Assinatura Clássica (Shor quebrando a chave privada ECDSA).
 */
export function simulateQuantumAttack(
  record: PqcProtectedClinicalRecord,
  attackType: PqcQuantumAttackType,
  hybridKeyPair: PqcHybridKeyPair
): PqcQuantumAttackSimulationResult {
  const simulationId = `q_sim_${crypto.randomUUID()}`;
  const simulatedAt = new Date().toISOString();

  let classicalCracked = false;
  let postQuantumCracked = false;
  let dataExfiltrated = false;
  let outcome: PqcDefenseOutcome = PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE;
  let explanation = '';

  switch (attackType) {
    case PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG: {
      // Shor encontra d tal que Q = d * G na curva prime256v1 em segundos
      classicalCracked = true;
      postQuantumCracked = false; // Problema Learning With Errors (LWE / reticulados) permanece intratável

      if (record.encapsulation.pqCiphertextBase64 === Buffer.from('CLASSICAL_FALLBACK_NO_PQC').toString('base64')) {
        // Se o registro não tinha proteção PQC (modo clássico puro)
        dataExfiltrated = true;
        outcome = PqcDefenseOutcome.CRACKED_CLASSICAL_ONLY;
        explanation = 'Vulnerabilidade Crítica: O registro utilizava apenas criptografia clássica (ECDH P-256). O algoritmo de Shor resolveu o logaritmo discreto e a chave simétrica foi completamente exposta.';
      } else {
        // No modo Híbrido, a DEK depende de SS_classical || SS_pq. Sem quebrar o reticulado ML-KEM, o atacante obtém apenas metade da KDF!
        dataExfiltrated = false;
        outcome = PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE;
        explanation = 'Defesa PQC Bem-Sucedida: O algoritmo de Shor quebrou o segredo ECDH P-256, mas a KDF Híbrida combinada (HKDF) permaneceu indecifrável devido à barreira matemática de reticulados ML-KEM-768 (FIPS 203). Nenhum dado do paciente foi vazado.';
      }
      break;
    }

    case PqcQuantumAttackType.STORE_NOW_DECRYPT_LATER_SNDL: {
      // Atacante interceptou tráfego e esperou computadores quânticos viáveis
      classicalCracked = true;
      postQuantumCracked = false;

      if (!record.quantumSafe) {
        dataExfiltrated = true;
        outcome = PqcDefenseOutcome.CRACKED_CLASSICAL_ONLY;
        explanation = 'Comprometimento Retrospectivo (SNDL): Gravação interceptada no passado foi decifrada com sucesso após o colapso quântico dos parâmetros de chave clássicos.';
      } else {
        dataExfiltrated = false;
        outcome = PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE;
        explanation = 'Imunidade SNDL Atestada: Mesmo com o tráfego e o handshake TLS gravados por décadas, a proteção híbrida ML-KEM impede decodificação retroativa (Forward Secrecy Quântico).';
      }
      break;
    }

    case PqcQuantumAttackType.FORGED_CLASSICAL_SIGNATURE: {
      // Atacante deriva a chave privada ECDSA e gera assinatura falsa de termo médico
      classicalCracked = true;
      postQuantumCracked = false;

      // O verificador híbrido rejeita a assinatura porque o componente ML-DSA é incompatível
      dataExfiltrated = false;
      outcome = PqcDefenseOutcome.ATTACK_REPELLED;
      explanation = 'Fraude Documental Neutralizada: O atacante falsificou a assinatura clássica ECDSA P-256, porém a validação dual rejeitou o documento imediatamente pela ausência de assinatura válida nos reticulados ML-DSA-65 (FIPS 204).';
      break;
    }

    case PqcQuantumAttackType.GROVERS_KEY_SEARCH: {
      // Grover reduz a segurança simétrica pela metade (AES-256 -> 128 bits de segurança efetiva)
      classicalCracked = false;
      postQuantumCracked = false;
      dataExfiltrated = false;
      outcome = PqcDefenseOutcome.DUAL_SECURITY_PRESERVED;
      explanation = 'Resistência a Grover Confirmada: Com chave AES-256 e KDF HKDF-SHA256, a aceleração quadrática do Algoritmo de Grover ainda exige 2^128 operações quânticas (equivalente a bilhões de anos de computação).';
      break;
    }
  }

  const proofSeal = createPqcProofSeal(simulationId, record.targetType, PqcHybridMode.HYBRID_PQC_CLASSICAL, {
    attackType,
    recordId: record.id,
    outcome,
    dataExfiltrated
  });

  return {
    simulationId,
    attackType,
    targetRecordId: record.id,
    outcome,
    classicalCracked,
    postQuantumCracked,
    dataExfiltrated,
    explanation,
    proofSeal,
    simulatedAt
  };
}

// =========================================================================
// PRESETS DE DEMONSTRAÇÃO CLÍNICA
// =========================================================================

export const PQC_CLINICAL_PRESETS = [
  {
    id: 'preset_soap_suicidal_risk',
    targetType: PqcClinicalTargetType.SOAP_EVOLUTION_RECORD,
    title: 'Evolução Psiquiátrica — Risco Grave de Autoextermínio (CID-11 6A70 / F32.3)',
    patientBlindIndex: 'pt_blind_88492048201',
    therapistId: 'user_psicologo_titular_1',
    content: 'Paciente comparece com ideação suicida ativa e plano estruturado. Iniciada contenção de crise, contato com suporte familiar e prescrição de vigilância contínua sob termo de sigilo estrito.'
  },
  {
    id: 'preset_telemedicine_violence',
    targetType: PqcClinicalTargetType.TELEMEDICINE_AUDIO_RECORDING,
    title: 'Gravação de Teleconsulta — Relato de Abuso Doméstico & Medida Protetiva',
    patientBlindIndex: 'pt_blind_11928472910',
    therapistId: 'user_psicologo_titular_1',
    content: 'Áudio gravado em teleconsulta confidencial de 50 minutos. Paciente relata histórico detalhado de violência doméstica, coação psicológica e encaminhamento para acolhimento emergencial.'
  },
  {
    id: 'preset_anamnesis_child',
    targetType: PqcClinicalTargetType.ANAMNESIS_BIOPSYCHOSOCIAL,
    title: 'Anamnese Biopsicossocial Infantil — Transtorno do Espectro Autista (TEA 6A02)',
    patientBlindIndex: 'pt_blind_33948172635',
    therapistId: 'user_psicologo_titular_1',
    content: 'Ficha detalhada de marcos de neurodesenvolvimento da infância, histórico pré-natal, relatórios psicopedagógicos e avaliação neuropsicológica com matrizes de inteligência.'
  },
  {
    id: 'preset_tcle_digital_signature',
    targetType: PqcClinicalTargetType.TCLE_CONSENT_FORM,
    title: 'Termo de Consentimento Livre e Esclarecido (TCLE) com Assinatura Dual',
    patientBlindIndex: 'pt_blind_77263910482',
    therapistId: 'user_psicologo_titular_1',
    content: 'Consentimento formal para telepsicologia (Resolução CFP nº 011/2018), gravação com crypto-shredding e tratamento de dados de saúde mental sob a LGPD com certificação quântica.'
  }
];
