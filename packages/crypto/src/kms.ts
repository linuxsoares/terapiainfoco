import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Interface para integração com HSM / Key Management Service
 * (GCP Cloud KMS, AWS KMS ou HashiCorp Vault)
 */
export interface KmsProvider {
  /**
   * Gera uma nova chave DEK de 256 bits, retornando a versão em texto claro
   * (para uso em RAM) e a versão encriptada pela KEK mestre (para persistência)
   */
  generateDataKey(): Promise<{ plaintextKey: Buffer; encryptedKey: string }>;

  /**
   * Decripta uma DEK utilizando a KEK protegida no HSM/KMS
   */
  decryptDataKey(encryptedKey: string): Promise<Buffer>;
}

/**
 * Provedor Local KMS com KEK em memória para desenvolvimento e testes
 */
export class LocalKmsProvider implements KmsProvider {
  private masterKek: Buffer;

  constructor(masterKek?: Buffer) {
    this.masterKek = masterKek ?? randomBytes(32);
  }

  async generateDataKey(): Promise<{ plaintextKey: Buffer; encryptedKey: string }> {
    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKek, iv, { authTagLength: 16 });

    const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const encryptedKey = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
    return { plaintextKey, encryptedKey };
  }

  async decryptDataKey(encryptedKey: string): Promise<Buffer> {
    const buffer = Buffer.from(encryptedKey, 'base64');
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', this.masterKek, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
