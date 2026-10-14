import { createHmac, createHash, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import type {
  SessionStateSnapshot,
  EncryptedSessionSnapshot,
  ClinicalSessionState,
  DisconnectionCause,
  SessionRecoveryGrade
} from '@terapiainfoco/shared';

export interface ReconnectionTokenPayload {
  sessionId: string;
  therapistId: string;
  nonce: string;
  exp: number; // Unix timestamp in seconds
}

export interface GeneratedReconnectionToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export interface VerifyTokenResult {
  valid: boolean;
  error?: string;
  payload?: ReconnectionTokenPayload;
}

const DEFAULT_TTL_SECONDS = 600; // 10 minutos (janela de tolerância ética CFP nº 011/2018)

/**
 * 1. Gera token de reconexão assinado com HMAC-SHA256
 */
export function generateReconnectionToken(params: {
  sessionId: string;
  therapistId: string;
  secret: string;
  ttlSeconds?: number;
}): GeneratedReconnectionToken {
  const ttl = params.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const nonce = randomBytes(16).toString('hex');

  const payload: ReconnectionTokenPayload = {
    sessionId: params.sessionId,
    therapistId: params.therapistId,
    nonce,
    exp
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', params.secret)
    .update(payloadBase64)
    .digest('hex');

  const token = `${payloadBase64}.${signature}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(exp * 1000).toISOString();

  return {
    token,
    tokenHash,
    expiresAt
  };
}

/**
 * 2. Verifica token de reconexão com proteção contra Timing Attacks e validação de expiração
 */
export function verifyReconnectionToken(
  token: string,
  secret: string,
  expectedSessionId: string
): VerifyTokenResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token ausente ou inválido' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Formato do token malformado (deve conter payload e assinatura)' };
  }

  const [payloadBase64, signature] = parts;

  // Valida assinatura HMAC-SHA256
  const expectedSignature = createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedSigBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedSigBuffer.length || !timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    return { valid: false, error: 'Assinatura criptográfica HMAC inválida (Anti-Tampering)' };
  }

  // Decodifica payload
  let payload: ReconnectionTokenPayload;
  try {
    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    payload = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Payload do token não pôde ser decodificado' };
  }

  // Valida integridade do sessionId
  if (payload.sessionId !== expectedSessionId) {
    return {
      valid: false,
      error: `Token pertence a outra sessão (esperado: ${expectedSessionId}, recebido: ${payload.sessionId})`
    };
  }

  // Valida expiração temporal
  const nowUnix = Math.floor(Date.now() / 1000);
  if (payload.exp < nowUnix) {
    return { valid: false, error: 'Janela de tolerância para reconexão expirada' };
  }

  return { valid: true, payload };
}

/**
 * Normaliza segredo em chave simétrica AES-256 de 32 bytes
 */
function deriveSnapshotKey(keyOrSecret: Buffer | string): Buffer {
  if (Buffer.isBuffer(keyOrSecret) && keyOrSecret.length === 32) {
    return keyOrSecret;
  }
  return createHash('sha256').update(keyOrSecret).digest();
}

/**
 * 3. Cifra o snapshot de estado da sessão com AES-256-GCM
 */
export function encryptSessionSnapshot(
  snapshot: SessionStateSnapshot,
  secretKey: Buffer | string
): EncryptedSessionSnapshot {
  const key = deriveSnapshotKey(secretKey);
  const iv = randomBytes(12);
  const jsonContent = JSON.stringify(snapshot);

  const snapshotDigest = createHash('sha256').update(jsonContent).digest('hex');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonContent, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertextBase64: encrypted.toString('base64'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    encryptedAt: new Date().toISOString(),
    snapshotDigest
  };
}

/**
 * 4. Decifra o snapshot de estado e atesta integridade dos dados clínicos
 */
export function decryptSessionSnapshot(
  encrypted: EncryptedSessionSnapshot,
  secretKey: Buffer | string
): SessionStateSnapshot {
  const key = deriveSnapshotKey(secretKey);
  const iv = Buffer.from(encrypted.ivHex, 'hex');
  const authTag = Buffer.from(encrypted.authTagHex, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertextBase64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const jsonStr = decrypted.toString('utf-8');

  // Verifica se o digest confere
  const calculatedDigest = createHash('sha256').update(jsonStr).digest('hex');
  if (calculatedDigest !== encrypted.snapshotDigest) {
    throw new Error('Falha de integridade: Digest do snapshot recuperado não confere com o registrado!');
  }

  return JSON.parse(jsonStr) as SessionStateSnapshot;
}

/**
 * 5. Calcula selo probatório canônico SHA-256 WORM de evento da sessão
 */
export function calculateSessionEventDigest(params: {
  sessionId: string;
  eventType: string;
  timestamp: string;
  therapistId: string;
  sequenceNumber: number;
  snapshotDigest?: string;
}): string {
  const canonicalString = [
    `SESSION_ID=${params.sessionId}`,
    `EVENT_TYPE=${params.eventType}`,
    `TIMESTAMP=${params.timestamp}`,
    `THERAPIST_ID=${params.therapistId}`,
    `SEQUENCE=${params.sequenceNumber}`,
    `SNAPSHOT_DIGEST=${params.snapshotDigest || 'NONE'}`
  ].join('|');

  return createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * 6. Classifica a qualidade e tempestividade da reconexão conforme limites éticos CFP 011/2018
 */
export function evaluateRecoveryGrade(
  disconnectionDurationSeconds: number,
  gracePeriodSeconds: number
): 'SEAMLESS' | 'RECOVERED' | 'EXPIRED_CONTINGENCY' {
  if (disconnectionDurationSeconds <= 15) {
    return 'SEAMLESS';
  }
  if (disconnectionDurationSeconds <= gracePeriodSeconds) {
    return 'RECOVERED';
  }
  return 'EXPIRED_CONTINGENCY';
}
