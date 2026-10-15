/**
 * Core Criptográfico de Token Binding & Prova de Posse DPoP (RFC 9449 / RFC 7638)
 * Plataforma TerapiaInFoco — RFC-001 §4.4, OWASP ASVS v4.0 & NIST SP 800-63B
 *
 * Implementa vinculação criptográfica estrita entre tokens de sessão JWT e chaves públicas
 * efêmeras dos navegadores/dispositivos (DPoP ES256 / JWK Thumbprint SHA-256), prevenindo
 * sequestro de sessão (Session Hijacking), replay attacks e sessões fantasmas concorrentes.
 */

import {
  generateKeyPairSync,
  createHash,
  createHmac,
  createSign,
  createVerify,
  timingSafeEqual,
  randomBytes
} from 'crypto';
import {
  SessionBindingMode,
  SessionLifecycleStatus,
  SessionDeviceType,
  type ClinicalActiveSession,
  type DpopProofPayload,
  type DpopVerificationResult,
  type SessionRevocationProof
} from '@terapiainfoco/shared';

const DEFAULT_SECRET_SALT = process.env.SESSION_REVOCATION_SALT || 'terapiainfoco_session_binding_worm_salt_2026';

/**
 * Representação de JWK EC P-256 Canônico
 */
export interface CanonicalEcJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

/**
 * Codificação Base64URL segura sem padding
 */
export function base64UrlEncode(buffer: Buffer | string): string {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'utf8');
  return b
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Decodificação Base64URL
 */
export function base64UrlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
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
 * Calcula o Thumbprint SHA-256 Canônico do JWK (RFC 7638)
 */
export function calculateJwkThumbprint(jwk: CanonicalEcJwk): string {
  // RFC 7638 define para 'EC': ordenar 'crv', 'kty', 'x', 'y'
  const canonicalObj = {
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y
  };
  const jsonString = canonicalizeJson(canonicalObj);
  const hash = createHash('sha256').update(jsonString).digest();
  return base64UrlEncode(hash);
}

/**
 * Gera um par de chaves ECDSA P-256 efêmero simulando o cliente (navegador/dispositivo)
 */
export function generateClientDeviceKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
  jwk: CanonicalEcJwk;
  thumbprint: string;
} {
  const keyPair = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  const privateKeyPem = keyPair.privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  }) as string;

  const publicKeyPem = keyPair.publicKey.export({
    type: 'spki',
    format: 'pem'
  }) as string;

  const jwkObject = keyPair.publicKey.export({ format: 'jwk' });

  const jwk: CanonicalEcJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: (jwkObject.x as string) || '',
    y: (jwkObject.y as string) || ''
  };

  const thumbprint = calculateJwkThumbprint(jwk);

  return {
    privateKeyPem,
    publicKeyPem,
    jwk,
    thumbprint
  };
}

/**
 * Cria uma Prova de Posse DPoP JWT (RFC 9449)
 */
export function createDpopProof(params: {
  privateKeyPem: string;
  jwk: CanonicalEcJwk;
  httpMethod: string;
  httpUri: string;
  accessToken?: string;
  jti?: string;
  iat?: number;
}): string {
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: params.jwk
  };

  const payload: DpopProofPayload = {
    jti: params.jti || `dpop_jti_${randomBytes(12).toString('hex')}`,
    htm: params.httpMethod.toUpperCase(),
    htu: params.httpUri,
    iat: params.iat || Math.floor(Date.now() / 1000)
  };

  if (params.accessToken) {
    const ath = createHash('sha256').update(params.accessToken).digest();
    payload.ath = base64UrlEncode(ath);
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: params.privateKeyPem,
    dsaEncoding: 'ieee-p1363'
  });

  const encodedSignature = base64UrlEncode(signature);
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Valida formalmente a Prova de Posse DPoP Criptográfica (RFC 9449)
 */
export function verifyDpopProof(
  dpopProof: string,
  expectedMethod: string,
  expectedUri: string,
  expectedAccessToken?: string,
  maxAgeSeconds = 300
): DpopVerificationResult {
  const verifiedAt = new Date().toISOString();

  if (!dpopProof || typeof dpopProof !== 'string') {
    return {
      isValid: false,
      clientThumbprint: '',
      error: 'Cabeçalho DPoP ausente ou formato inválido.',
      verifiedAt
    };
  }

  const parts = dpopProof.split('.');
  if (parts.length !== 3) {
    return {
      isValid: false,
      clientThumbprint: '',
      error: 'Formato de token DPoP inválido (deve conter 3 segmentos JWT).',
      verifiedAt
    };
  }

  try {
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    const payload: DpopProofPayload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    const signature = base64UrlDecode(sigB64);

    // 1. Validar Typ e Alg
    if (header.typ !== 'dpop+jwt') {
      return {
        isValid: false,
        clientThumbprint: '',
        error: `Tipo de token DPoP inválido: esperado 'dpop+jwt', recebido '${header.typ}'.`,
        verifiedAt
      };
    }

    if (header.alg !== 'ES256') {
      return {
        isValid: false,
        clientThumbprint: '',
        error: `Algoritmo DPoP inválido: esperado 'ES256', recebido '${header.alg}'.`,
        verifiedAt
      };
    }

    if (!header.jwk || header.jwk.kty !== 'EC' || header.jwk.crv !== 'P-256' || !header.jwk.x || !header.jwk.y) {
      return {
        isValid: false,
        clientThumbprint: '',
        error: 'Chave pública JWK do cliente ausente ou incompleta no cabeçalho DPoP.',
        verifiedAt
      };
    }

    const jwkThumbprint = calculateJwkThumbprint(header.jwk);

    // 2. Validar HTTP Method (HTM) e URI (HTU)
    if (payload.htm.toUpperCase() !== expectedMethod.toUpperCase()) {
      return {
        isValid: false,
        clientThumbprint: jwkThumbprint,
        error: `Método HTTP DPoP divergente: recebido '${payload.htm}', esperado '${expectedMethod.toUpperCase()}'.`,
        verifiedAt
      };
    }

    // Aceita URI exata ou normalização de pathname
    const receivedPath = payload.htu.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const expectedPath = expectedUri.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

    if (payload.htu !== expectedUri && receivedPath !== expectedPath) {
      return {
        isValid: false,
        clientThumbprint: jwkThumbprint,
        error: `URI de destino DPoP divergente: recebido '${payload.htu}', esperado '${expectedUri}'.`,
        verifiedAt
      };
    }

    // 3. Validar Janela de Tempo (Anti-Replay / Clock Skew)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - payload.iat) > maxAgeSeconds) {
      return {
        isValid: false,
        clientThumbprint: jwkThumbprint,
        error: `Prova DPoP expirada ou relógio dessincronizado (|diff| > ${maxAgeSeconds}s).`,
        verifiedAt
      };
    }

    // 4. Validar Access Token Hash (ATH) se especificado
    if (expectedAccessToken) {
      if (!payload.ath) {
        return {
          isValid: false,
          clientThumbprint: jwkThumbprint,
          error: 'Reivindicação ath (Access Token Hash) obrigatória ausente no payload DPoP.',
          verifiedAt
        };
      }

      const expectedAth = base64UrlEncode(createHash('sha256').update(expectedAccessToken).digest());
      if (payload.ath !== expectedAth) {
        return {
          isValid: false,
          clientThumbprint: jwkThumbprint,
          error: 'Hash do Access Token (ath) divergente. Tentativa de injeção de token não vinculado.',
          verifiedAt
        };
      }
    }

    // 5. Verificar Assinatura ECDSA P-256 (ES256)
    const signingInput = `${headerB64}.${payloadB64}`;
    
    // Importa chave JWK pública em formato compatível com crypto.createVerify
    const { createPublicKey } = require('crypto');
    const publicKey = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: header.jwk.x,
        y: header.jwk.y
      },
      format: 'jwk'
    });

    const verifier = createVerify('SHA256');
    verifier.update(signingInput);
    verifier.end();

    const isSigValid = verifier.verify(
      {
        key: publicKey,
        dsaEncoding: 'ieee-p1363'
      },
      signature
    );

    if (!isSigValid) {
      return {
        isValid: false,
        clientThumbprint: jwkThumbprint,
        error: 'Assinatura digital ECDSA P-256 forjada ou corrompida na prova DPoP.',
        verifiedAt
      };
    }

    return {
      isValid: true,
      clientThumbprint: jwkThumbprint,
      verifiedAt,
      claims: payload
    };
  } catch (err: any) {
    return {
      isValid: false,
      clientThumbprint: '',
      error: `Falha ao decodificar prova DPoP: ${err.message}`,
      verifiedAt
    };
  }
}

/**
 * Gera Selo Notarial Probatório WORM de Revogação de Sessão Clínica
 * Formato: session_rev_v1_<base64url>
 */
export function generateSessionRevocationProof(
  session: ClinicalActiveSession,
  secretSalt = DEFAULT_SECRET_SALT
): string {
  const revokedAt = session.revokedAt || new Date().toISOString();
  const canonicalObject = {
    bindingMode: session.bindingMode,
    clientJkt: session.clientJkt || null,
    createdAt: session.createdAt,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    reason: session.revocationReason || 'Revogação forçada de segurança',
    revokedAt,
    sessionId: session.sessionId,
    status: session.status,
    userId: session.userId
  };

  const canonicalString = canonicalizeJson(canonicalObject);
  const canonicalHash = createHash('sha256').update(canonicalString).digest('hex');

  const signature = createHmac('sha256', secretSalt)
    .update(`session_revocation:${session.sessionId}:${canonicalHash}`)
    .digest('hex');

  const payload = {
    v: 1,
    sid: session.sessionId,
    uid: session.userId,
    cnh: canonicalHash,
    sig: signature,
    iat: revokedAt
  };

  return `session_rev_v1_${base64UrlEncode(JSON.stringify(payload))}`;
}

/**
 * Verificação Pericial da Prova Notarial de Revogação de Sessão
 */
export function verifySessionRevocationProof(
  proofSeal: string,
  session: ClinicalActiveSession,
  secretSalt = DEFAULT_SECRET_SALT
): SessionRevocationProof {
  const now = new Date().toISOString();

  if (!proofSeal || !proofSeal.startsWith('session_rev_v1_')) {
    return {
      isValid: false,
      proofSeal: proofSeal || '',
      sessionId: session.sessionId,
      userId: session.userId,
      reason: session.revocationReason || '',
      revokedAt: session.revokedAt || '',
      details: 'Selo probatório de revogação ausente ou formato inválido.'
    };
  }

  try {
    const raw = proofSeal.replace('session_rev_v1_', '');
    const decoded = JSON.parse(base64UrlDecode(raw).toString('utf8'));

    if (decoded.v !== 1 || decoded.sid !== session.sessionId || decoded.uid !== session.userId) {
      return {
        isValid: false,
        proofSeal,
        sessionId: session.sessionId,
        userId: session.userId,
        reason: session.revocationReason || '',
        revokedAt: session.revokedAt || '',
        details: 'Metadados no selo diferem da sessão inspecionada.'
      };
    }

    const canonicalObject = {
      bindingMode: session.bindingMode,
      clientJkt: session.clientJkt || null,
      createdAt: session.createdAt,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      ipAddress: session.ipAddress,
      reason: session.revocationReason || 'Revogação forçada de segurança',
      revokedAt: session.revokedAt || decoded.iat,
      sessionId: session.sessionId,
      status: session.status,
      userId: session.userId
    };

    const recomputedHash = createHash('sha256')
      .update(canonicalizeJson(canonicalObject))
      .digest('hex');

    if (recomputedHash !== decoded.cnh) {
      return {
        isValid: false,
        proofSeal,
        sessionId: session.sessionId,
        userId: session.userId,
        reason: session.revocationReason || '',
        revokedAt: session.revokedAt || '',
        details: 'Digest canônico SHA-256 divergente. Dados da revogação adulterados retroativamente.'
      };
    }

    const expectedSig = createHmac('sha256', secretSalt)
      .update(`session_revocation:${session.sessionId}:${recomputedHash}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(decoded.sig, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return {
        isValid: false,
        proofSeal,
        sessionId: session.sessionId,
        userId: session.userId,
        reason: session.revocationReason || '',
        revokedAt: session.revokedAt || '',
        details: 'Assinatura criptográfica forjada ou chave de auditoria inválida.'
      };
    }

    return {
      isValid: true,
      proofSeal,
      sessionId: session.sessionId,
      userId: session.userId,
      reason: session.revocationReason || '',
      revokedAt: session.revokedAt || decoded.iat,
      details: 'Selo probatório de revogação válido e matematicamente íntegro.'
    };
  } catch (err: any) {
    return {
      isValid: false,
      proofSeal,
      sessionId: session.sessionId,
      userId: session.userId,
      reason: session.revocationReason || '',
      revokedAt: session.revokedAt || '',
      details: `Falha na decodificação do selo de revogação: ${err.message}`
    };
  }
}
