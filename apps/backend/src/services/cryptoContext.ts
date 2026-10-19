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
export const kmsProvider = new LocalKmsProvider(config.kmsMasterKey);
export const envelopeService = new EnvelopeEncryptionService(kmsProvider);

// Chave da aplicação para encriptação Field-Level padrão (FLE).
// Sem FIELD_ENCRYPTION_KEY (somente dev/testes) a chave é efêmera e os dados cifrados não sobrevivem a um restart.
if (!config.fieldEncryptionKey) {
  console.warn('⚠️ FIELD_ENCRYPTION_KEY ausente: usando chave FLE efêmera (apenas desenvolvimento/testes).');
}
const appFieldKey = config.fieldEncryptionKey ?? generateRandomKey(32);

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
