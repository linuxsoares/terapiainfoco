import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedPayload } from '@terapiainfoco/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado pelo NIST para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits de tag de autenticação

/**
 * Gera uma chave criptográfica aleatória segura (padrão 256 bits / 32 bytes)
 */
export function generateRandomKey(bytes = 32): Buffer {
  return randomBytes(bytes);
}

/**
 * Criptografa texto utilizando AES-256-GCM com IV único e tag de autenticação
 */
export function encryptAesGcm(plaintext: string, key: Buffer): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error('A chave para AES-256 deve conter exatamente 32 bytes (256 bits)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * Decripta e valida a integridade do payload usando AES-256-GCM
 * Lança erro caso a tag de autenticação seja inválida (tentativa de adulteração)
 */
export function decryptAesGcm(payload: EncryptedPayload, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('A chave para AES-256 deve conter exatamente 32 bytes (256 bits)');
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
