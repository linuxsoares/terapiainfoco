import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  KmsKeyMetadata,
  KmsKeyStatus,
  KmsProviderType
} from '@terapiainfoco/shared';

/**
 * Interface para integração com HSM / Key Management Service
 * (GCP Cloud KMS, AWS KMS, HashiCorp Vault ou Local KMS)
 * em conformidade com NIST SP 800-57 & RFC-001 §4.2
 */
export interface KmsProvider {
  /**
   * Retorna o número da versão ativa atual da KEK mestre
   */
  getActiveKeyVersion(): number;

  /**
   * Obtém metadados de uma versão específica da KEK ou da versão ativa
   */
  getKeyMetadata(version?: number): Promise<KmsKeyMetadata | null>;

  /**
   * Lista todas as versões gerenciadas da KEK (ativas, rotacionadas e revogadas)
   */
  listKeys(): Promise<KmsKeyMetadata[]>;

  /**
   * Gera uma nova chave DEK de 256 bits, retornando a versão em texto claro
   * (para uso em RAM) e a versão encriptada pela KEK mestre ativa (para persistência)
   */
  generateDataKey(): Promise<{ plaintextKey: Buffer; encryptedKey: string }>;

  /**
   * Decripta uma DEK utilizando a KEK correspondente à sua versão no HSM/KMS
   */
  decryptDataKey(encryptedKey: string): Promise<Buffer>;

  /**
   * Rotaciona a Master Key (KEK) para uma nova versão criptográfica (NIST SP 800-57)
   */
  rotateMasterKey(reason?: string): Promise<KmsKeyMetadata>;

  /**
   * Re-envelopa (re-wrap) uma DEK legada com a KEK ativa mais recente sem expor o dado
   */
  reWrapDataKey(encryptedKey: string, targetVersion?: number): Promise<string>;

  /**
   * Revoga uma versão legada de KEK por exigência de conformidade ou incidente
   */
  revokeKeyVersion(version: number, reason: string): Promise<KmsKeyMetadata>;
}

interface KeyEntry {
  kek: Buffer;
  metadata: KmsKeyMetadata;
}

/**
 * Provedor Local KMS com gerenciamento de ciclo de vida de chaves KEK
 * (NIST SP 800-57, RFC-001 §4.2, Envelope Encryption)
 */
export class LocalKmsProvider implements KmsProvider {
  private keysMap = new Map<number, KeyEntry>();
  private currentActiveVersion: number = 1;

  constructor(initialMasterKek?: Buffer) {
    const kek = initialMasterKek ?? randomBytes(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 ano de validade

    const initialMetadata: KmsKeyMetadata = {
      keyId: 'kek-v1-primary',
      version: 1,
      algorithm: 'AES-256-GCM',
      status: KmsKeyStatus.ACTIVE,
      providerType: KmsProviderType.LOCAL_MOCK,
      createdAt: now.toISOString(),
      rotatedAt: null,
      revokedAt: null,
      expiresAt: expiresAt.toISOString(),
      encryptedDeksCount: 0,
      rotationReason: 'Chave inicial padrão do sistema'
    };

    this.keysMap.set(1, { kek, metadata: initialMetadata });
    this.currentActiveVersion = 1;
  }

  getActiveKeyVersion(): number {
    return this.currentActiveVersion;
  }

  async getKeyMetadata(version?: number): Promise<KmsKeyMetadata | null> {
    const ver = version ?? this.currentActiveVersion;
    const entry = this.keysMap.get(ver);
    return entry ? { ...entry.metadata } : null;
  }

  async listKeys(): Promise<KmsKeyMetadata[]> {
    return Array.from(this.keysMap.values())
      .map(entry => ({ ...entry.metadata }))
      .sort((a, b) => b.version - a.version);
  }

  async generateDataKey(): Promise<{ plaintextKey: Buffer; encryptedKey: string }> {
    const activeEntry = this.keysMap.get(this.currentActiveVersion);
    if (!activeEntry || activeEntry.metadata.status !== KmsKeyStatus.ACTIVE) {
      throw new Error(`Nenhuma KEK em estado ACTIVE disponível no KMS (versão atual: ${this.currentActiveVersion})`);
    }

    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', activeEntry.kek, iv, { authTagLength: 16 });

    const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const rawPayload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
    const encryptedKey = `v${this.currentActiveVersion}:${rawPayload}`;

    // Incrementa contagem de DEKs ativas encriptadas com esta versão
    activeEntry.metadata.encryptedDeksCount++;

    return { plaintextKey, encryptedKey };
  }

  async decryptDataKey(encryptedKey: string): Promise<Buffer> {
    let version = 1;
    let base64Payload = encryptedKey;

    // Extrai versão do prefixo "v{number}:..." ou assume v1 para dados pré-existentes
    const match = /^v(\d+):(.+)$/.exec(encryptedKey);
    if (match) {
      version = parseInt(match[1], 10);
      base64Payload = match[2];
    }

    const entry = this.keysMap.get(version);
    if (!entry) {
      throw new Error(`KEK versão ${version} não foi encontrada no repositório de chaves do KMS`);
    }

    if (entry.metadata.status === KmsKeyStatus.REVOKED || entry.metadata.status === KmsKeyStatus.DESTROYED) {
      throw new Error(`Acesso negado: KEK versão ${version} está ${entry.metadata.status} e não permite operações de decifragem`);
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.length < 28) {
      throw new Error('Payload criptográfico de DEK malformatado ou incompleto');
    }

    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', entry.kek, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async rotateMasterKey(reason?: string): Promise<KmsKeyMetadata> {
    const currentEntry = this.keysMap.get(this.currentActiveVersion);
    const now = new Date();

    if (currentEntry) {
      currentEntry.metadata.status = KmsKeyStatus.ROTATED;
      currentEntry.metadata.rotatedAt = now.toISOString();
      currentEntry.metadata.rotationReason = reason ?? 'Rotação de chave mestre programada (NIST SP 800-57)';
    }

    const nextVersion = this.currentActiveVersion + 1;
    const newKek = randomBytes(32);
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const newMetadata: KmsKeyMetadata = {
      keyId: `kek-v${nextVersion}-${Date.now()}`,
      version: nextVersion,
      algorithm: 'AES-256-GCM',
      status: KmsKeyStatus.ACTIVE,
      providerType: KmsProviderType.LOCAL_MOCK,
      createdAt: now.toISOString(),
      rotatedAt: null,
      revokedAt: null,
      expiresAt: expiresAt.toISOString(),
      encryptedDeksCount: 0,
      rotationReason: reason ?? 'Nova versão de KEK ativa'
    };

    this.keysMap.set(nextVersion, { kek: newKek, metadata: newMetadata });
    this.currentActiveVersion = nextVersion;

    return { ...newMetadata };
  }

  async reWrapDataKey(encryptedKey: string, targetVersion?: number): Promise<string> {
    const targetVer = targetVersion ?? this.currentActiveVersion;
    const targetEntry = this.keysMap.get(targetVer);

    if (!targetEntry) {
      throw new Error(`Versão de destino ${targetVer} não existe no KMS`);
    }
    if (targetEntry.metadata.status === KmsKeyStatus.REVOKED || targetEntry.metadata.status === KmsKeyStatus.DESTROYED) {
      throw new Error(`Não é possível re-envelopar DEK com uma chave ${targetEntry.metadata.status}`);
    }

    // 1. Decifra a DEK com a versão original
    const plaintextDek = await this.decryptDataKey(encryptedKey);

    try {
      // 2. Re-encripta a DEK com a KEK de destino
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', targetEntry.kek, iv, { authTagLength: 16 });

      const ciphertext = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const rawPayload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
      const newEncryptedKey = `v${targetVer}:${rawPayload}`;

      targetEntry.metadata.encryptedDeksCount++;

      return newEncryptedKey;
    } finally {
      // Zeroization em memória RAM
      plaintextDek.fill(0);
    }
  }

  async revokeKeyVersion(version: number, reason: string): Promise<KmsKeyMetadata> {
    if (version === this.currentActiveVersion) {
      throw new Error('Não é permitido revogar a versão ativa da KEK. Rotacione para uma nova versão antes de revogar a atual.');
    }

    const entry = this.keysMap.get(version);
    if (!entry) {
      throw new Error(`KEK versão ${version} não foi encontrada no KMS`);
    }

    entry.metadata.status = KmsKeyStatus.REVOKED;
    entry.metadata.revokedAt = new Date().toISOString();
    entry.metadata.rotationReason = `Revogada: ${reason}`;

    return { ...entry.metadata };
  }
}
