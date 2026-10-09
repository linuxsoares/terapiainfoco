import type { EnvelopeEncryptedData } from '@terapiainfoco/shared';
import { encryptAesGcm, decryptAesGcm } from './cipher';
import type { KmsProvider } from './kms';

/**
 * Serviço de Envelope Encryption conforme RFC-001 §4.2:
 * 1. O KMS gera uma DEK simétrica AES-256 única por paciente/contexto.
 * 2. O dado é encriptado na aplicação via AES-256-GCM.
 * 3. A DEK em texto claro é descartada da RAM após a operação.
 * 4. A DEK encriptada (encryptedDek) é salva junto ao payload no banco.
 */
export class EnvelopeEncryptionService {
  constructor(private kms: KmsProvider) {}

  /**
   * Criptografa o dado gerando uma nova DEK via KMS
   */
  async encrypt(plaintext: string): Promise<EnvelopeEncryptedData> {
    const { plaintextKey, encryptedKey } = await this.kms.generateDataKey();

    try {
      const payload = encryptAesGcm(plaintext, plaintextKey);
      return {
        payload,
        encryptedDek: encryptedKey
      };
    } finally {
      // Limpeza da chave em RAM (Zero memory)
      plaintextKey.fill(0);
    }
  }

  /**
   * Criptografa o dado reutilizando uma DEK já existente (ex: DEK do Terapeuta ou Paciente)
   */
  async encryptWithExistingDek(plaintext: string, encryptedDek: string): Promise<EnvelopeEncryptedData> {
    const plaintextKey = await this.kms.decryptDataKey(encryptedDek);

    try {
      const payload = encryptAesGcm(plaintext, plaintextKey);
      return {
        payload,
        encryptedDek
      };
    } finally {
      plaintextKey.fill(0);
    }
  }

  /**
   * Decripta os dados solicitando ao KMS a abertura da DEK
   */
  async decrypt(envelope: EnvelopeEncryptedData): Promise<string> {
    const plaintextKey = await this.kms.decryptDataKey(envelope.encryptedDek);

    try {
      return decryptAesGcm(envelope.payload, plaintextKey);
    } finally {
      plaintextKey.fill(0);
    }
  }
}
