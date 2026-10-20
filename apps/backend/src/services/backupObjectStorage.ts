import { S3Client } from 'bun';
import { config } from '../config';

/**
 * Destino durável dos snapshots de backup, fora do processo da API.
 * O conteúdo já chega cifrado por Envelope Encryption (KMS): o bucket nunca vê dados em claro.
 */
export interface BackupObjectStorage {
  /** Identificação legível do destino (ex.: s3://bucket/backups/) */
  readonly location: string;
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Chaves sob o prefixo, das mais recentes para as mais antigas */
  listRecent(limit: number): Promise<string[]>;
}

export const BACKUP_OBJECT_SUFFIX = '.kms-backup.json';

export function backupObjectKey(backupId: string): string {
  return `${config.backupStorage.prefix}${backupId}${BACKUP_OBJECT_SUFFIX}`;
}

class S3BackupObjectStorage implements BackupObjectStorage {
  readonly location: string;
  private client: S3Client;

  constructor(private settings: typeof config.backupStorage) {
    this.client = new S3Client({
      bucket: settings.bucket,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
      ...(settings.region ? { region: settings.region } : {})
    });
    this.location = `s3://${settings.bucket}/${settings.prefix}`;
  }

  async put(key: string, body: string): Promise<void> {
    await this.client.write(key, body, { type: 'application/json' });
  }

  async get(key: string): Promise<string | null> {
    const file = this.client.file(key);
    if (!(await file.exists())) return null;
    return file.text();
  }

  async listRecent(limit: number): Promise<string[]> {
    const objects: { key: string; lastModified: string }[] = [];
    let startAfter: string | undefined;
    // Paginação de 1.000 em 1.000 até esgotar o prefixo
    while (true) {
      const page = await this.client.list({ prefix: this.settings.prefix, startAfter, maxKeys: 1000 });
      const contents = page.contents ?? [];
      for (const item of contents) {
        if (item.key.endsWith(BACKUP_OBJECT_SUFFIX)) {
          objects.push({ key: item.key, lastModified: item.lastModified ?? '' });
        }
      }
      if (!page.isTruncated || contents.length === 0) break;
      startAfter = contents[contents.length - 1]!.key;
    }
    return objects
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
      .slice(0, limit)
      .map((item) => item.key);
  }
}

export function createBackupObjectStorage(): BackupObjectStorage | null {
  return config.backupStorage.bucket ? new S3BackupObjectStorage(config.backupStorage) : null;
}
