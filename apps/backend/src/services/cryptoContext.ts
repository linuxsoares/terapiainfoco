import {
  LocalKmsProvider,
  EnvelopeEncryptionService,
  generateRandomKey,
  encryptAesGcm,
  decryptAesGcm,
  computeBlindIndex,
  normalizeEmail,
  normalizeCpf
} from '@terapiainfoco/crypto';
import type { EncryptedPayload } from '@terapiainfoco/shared';
import { config } from '../config';

// Inicializa KMS local e serviço de Envelope Encryption
export const kmsProvider = new LocalKmsProvider();
export const envelopeService = new EnvelopeEncryptionService(kmsProvider);

// Chave da aplicação para encriptação Field-Level padrão (FLE)
const appFieldKey = generateRandomKey(32);

export function encryptField(value: string): EncryptedPayload {
  return encryptAesGcm(value, appFieldKey);
}

export function decryptField(payload: EncryptedPayload): string {
  return decryptAesGcm(payload, appFieldKey);
}

export function hashEmail(email: string): string {
  return computeBlindIndex(normalizeEmail(email), config.blindIndexSalt);
}

export function hashCpf(cpf: string): string {
  return computeBlindIndex(normalizeCpf(cpf), config.blindIndexSalt);
}
