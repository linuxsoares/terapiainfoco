import crypto from 'node:crypto';
import {
  EphemeralTokenStatus,
  EphemeralTokenTarget,
  RevocationReason,
  EphemeralTokenVerificationVerdict
} from '@terapiainfoco/shared';
import type {
  EphemeralAccessTokenPayload,
  EphemeralAccessToken,
  EphemeralTokenProofSeal,
  EphemeralTokenConsumptionRecord
} from '@terapiainfoco/shared';

// Segredo do Enclave de Tokens Efêmeros (RFC 7519 / RFC 7009)
const EPHEMERAL_SECRET = process.env.EPHEMERAL_TOKEN_MASTER_SECRET || 'terapiainfoco_ephemeral_token_master_enclave_secret_2026_rf7519';
const EPHEMERAL_SEAL_KEY = process.env.EPHEMERAL_SEAL_SECRET || 'terapiainfoco_ephemeral_notary_seal_key_worm_rfc8785';

/**
 * Converte Buffer ou String para Base64URL (RFC 7515 / RFC 7519)
 */
export function toBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Converte Base64URL para Buffer
 */
export function fromBase64Url(base64url: string): Buffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Serialização canônica JSON RFC 8785 (JCS)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Emite um Selo Probatório WORM de Token Efêmero (RFC 8785 & HMAC-SHA256)
 */
export function createEphemeralProofSeal(params: {
  tokenId: string;
  action: string;
  details: Record<string, any>;
}): EphemeralTokenProofSeal {
  const issuedAt = new Date().toISOString();
  const canonicalData = canonicalStringify({
    tokenId: params.tokenId,
    action: params.action,
    issuedAt,
    details: params.details
  });

  const canonicalDigest = crypto.createHash('sha256').update(canonicalData, 'utf-8').digest('hex');
  const hmacSignature = crypto
    .createHmac('sha256', EPHEMERAL_SEAL_KEY)
    .update(canonicalDigest, 'hex')
    .digest('hex');

  const sealPayload = JSON.stringify({
    tokenId: params.tokenId,
    action: params.action,
    digest: canonicalDigest,
    sig: hmacSignature,
    iat: issuedAt
  });
  const sealToken = `ephemeral_v1_${toBase64Url(Buffer.from(sealPayload, 'utf-8'))}`;

  return {
    sealToken,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    tokenId: params.tokenId,
    action: params.action
  };
}

/**
 * Valida a autenticidade criptográfica de um Selo Probatório WORM de Token Efêmero
 */
export function verifyEphemeralProofSeal(sealToken: string): {
  isValid: boolean;
  message: string;
  payload?: any;
} {
  try {
    if (!sealToken || !sealToken.startsWith('ephemeral_v1_')) {
      return { isValid: false, message: 'Formato de token probatório inválido ou prefixo incorreto.' };
    }

    const rawBase64Url = sealToken.replace('ephemeral_v1_', '');
    const jsonStr = fromBase64Url(rawBase64Url).toString('utf-8');
    const parsed = JSON.parse(jsonStr);

    if (!parsed.digest || !parsed.sig || !parsed.tokenId) {
      return { isValid: false, message: 'Payload do selo probatório incompleto.' };
    }

    const expectedSig = crypto
      .createHmac('sha256', EPHEMERAL_SEAL_KEY)
      .update(parsed.digest, 'hex')
      .digest('hex');

    const sigBuf = Buffer.from(parsed.sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { isValid: false, message: 'Assinatura HMAC-SHA256 do selo WORM inválida ou forjada.' };
    }

    return {
      isValid: true,
      message: 'Selo probatório de credencial efêmera autêntico e íntegro (WORM).',
      payload: parsed
    };
  } catch (err: any) {
    return {
      isValid: false,
      message: `Falha na auditoria do selo probatório: ${err.message || 'Dados inválidos'}`
    };
  }
}

/**
 * Gera um Blind Index para o paciente
 */
export function generatePatientBlindIndex(patientId: string): string {
  return crypto
    .createHmac('sha256', EPHEMERAL_SECRET)
    .update(`blind_patient_${patientId}`, 'utf-8')
    .digest('hex');
}

/**
 * Mascara o ID do paciente para apresentação segura em conformidade com LGPD
 */
export function maskPatientId(patientId: string): string {
  if (patientId.length <= 6) return 'PAC-***';
  return `${patientId.slice(0, 3)}***${patientId.slice(-3)}`;
}

/**
 * Emite uma Credencial de Acesso Temporário / Token Efêmero (RFC 7519)
 */
export function issueEphemeralAccessToken(params: {
  patientId: string;
  therapistCrp: string;
  roomId: string;
  target?: EphemeralTokenTarget;
  ttlMinutes?: number;
  validInAdvanceMinutes?: number;
  singleUse?: boolean;
}): {
  token: EphemeralAccessToken;
  tokenString: string;
  magicLink: string;
} {
  const tokenId = `eph_${crypto.randomBytes(12).toString('hex')}`;
  const now = Math.floor(Date.now() / 1000);
  const ttlMinutes = params.ttlMinutes ?? 60; // 1 hora padrão
  const advanceMinutes = params.validInAdvanceMinutes ?? 10; // link abre 10 min antes

  const iat = now;
  const nbf = now - advanceMinutes * 60;
  const exp = now + ttlMinutes * 60;

  const target = params.target ?? EphemeralTokenTarget.TELECONSULTATION_ROOM;
  const singleUse = params.singleUse ?? true;
  const patientBlindIndex = generatePatientBlindIndex(params.patientId);
  const patientIdMasked = maskPatientId(params.patientId);

  const roomHash = crypto
    .createHash('sha256')
    .update(params.roomId, 'utf-8')
    .digest('hex');

  const nonce = crypto.randomBytes(16).toString('hex');

  const payload: EphemeralAccessTokenPayload = {
    jti: tokenId,
    sub: patientBlindIndex,
    therapistCrp: params.therapistCrp,
    roomId: params.roomId,
    roomHash,
    target,
    singleUse,
    iat,
    nbf,
    exp,
    maxDurationMinutes: ttlMinutes,
    nonce
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const headerB64 = toBase64Url(JSON.stringify(header));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', EPHEMERAL_SECRET)
    .update(unsignedToken, 'utf-8')
    .digest();
  const signatureB64 = toBase64Url(signature);

  const tokenString = `${unsignedToken}.${signatureB64}`;

  const proofSeal = createEphemeralProofSeal({
    tokenId,
    action: 'EPHEMERAL_TOKEN_ISSUED',
    details: {
      patientBlindIndex,
      therapistCrp: params.therapistCrp,
      roomId: params.roomId,
      target,
      singleUse,
      nbf,
      exp
    }
  });

  const token: EphemeralAccessToken = {
    tokenId,
    tokenString,
    patientBlindIndex,
    patientIdMasked,
    therapistCrp: params.therapistCrp,
    roomId: params.roomId,
    target,
    status: EphemeralTokenStatus.ACTIVE_PENDING,
    singleUse,
    issuedAt: new Date(iat * 1000).toISOString(),
    notBefore: new Date(nbf * 1000).toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(),
    ttlSecondsRemaining: exp - now,
    proofSeal
  };

  const magicLink = `https://terapiainfoco.com.br/teleconsulta/join?token=${encodeURIComponent(tokenString)}`;

  return { token, tokenString, magicLink };
}

/**
 * Valida a integridade criptográfica e temporal de um Token Efêmero (RFC 7519 / RFC 7009)
 */
export function verifyEphemeralAccessToken(
  tokenString: string,
  expectedRoomId?: string,
  clockSkewLeewaySeconds: number = 30
): {
  verdict: EphemeralTokenVerificationVerdict;
  isValid: boolean;
  message: string;
  payload?: EphemeralAccessTokenPayload;
} {
  try {
    if (!tokenString || typeof tokenString !== 'string') {
      return {
        verdict: EphemeralTokenVerificationVerdict.SIGNATURE_INVALID,
        isValid: false,
        message: 'Token ausente ou malformado.'
      };
    }

    const parts = tokenString.split('.');
    if (parts.length !== 3) {
      return {
        verdict: EphemeralTokenVerificationVerdict.SIGNATURE_INVALID,
        isValid: false,
        message: 'Estrutura compacta JWT inválida (requer 3 segmentos header.payload.signature).'
      };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const unsignedToken = `${headerB64}.${payloadB64}`;

    const expectedSig = crypto
      .createHmac('sha256', EPHEMERAL_SECRET)
      .update(unsignedToken, 'utf-8')
      .digest();
    const providedSig = fromBase64Url(signatureB64);

    if (
      providedSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(providedSig, expectedSig)
    ) {
      return {
        verdict: EphemeralTokenVerificationVerdict.SIGNATURE_INVALID,
        isValid: false,
        message: 'Assinatura HMAC-SHA256 do token efêmero inválida ou adulterada.'
      };
    }

    const payloadJson = fromBase64Url(payloadB64).toString('utf-8');
    const payload = JSON.parse(payloadJson) as EphemeralAccessTokenPayload;

    const now = Math.floor(Date.now() / 1000);

    // Verificação de Premature Access (Not Before)
    if (now < payload.nbf - clockSkewLeewaySeconds) {
      return {
        verdict: EphemeralTokenVerificationVerdict.PREMATURE_ACCESS_NBF,
        isValid: false,
        message: `Acesso prematuro bloqueado. Link válido apenas a partir de ${new Date(payload.nbf * 1000).toLocaleString('pt-BR')}.`,
        payload
      };
    }

    // Verificação de Expiração
    if (now > payload.exp + clockSkewLeewaySeconds) {
      return {
        verdict: EphemeralTokenVerificationVerdict.TOKEN_EXPIRED,
        isValid: false,
        message: `Token expirado em ${new Date(payload.exp * 1000).toLocaleString('pt-BR')}. Solicite um novo link ao terapeuta.`,
        payload
      };
    }

    // Verificação de Sala (Room Binding)
    if (expectedRoomId && payload.roomId !== expectedRoomId) {
      return {
        verdict: EphemeralTokenVerificationVerdict.ROOM_MISMATCH,
        isValid: false,
        message: `Incompatibilidade de sala: token restrito à sala ${payload.roomId}, tentativa de uso na sala ${expectedRoomId}.`,
        payload
      };
    }

    return {
      verdict: EphemeralTokenVerificationVerdict.VALID_GRANTED,
      isValid: true,
      message: 'Token efêmero íntegro, autêntico e tempestivo.',
      payload
    };
  } catch (err: any) {
    return {
      verdict: EphemeralTokenVerificationVerdict.SIGNATURE_INVALID,
      isValid: false,
      message: `Erro na validação do token: ${err.message || 'Dados inválidos'}`
    };
  }
}
