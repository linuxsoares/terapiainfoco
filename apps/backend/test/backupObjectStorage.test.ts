import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { db } from '../src/db/memoryDb';
import { BackupService, backupStore } from '../src/services/backupService';
import { backupObjectKey, type BackupObjectStorage } from '../src/services/backupObjectStorage';
import { adminRequest } from './helpers/adminRequest';

/** Bucket falso: guarda os objetos num Map, na ordem de gravação */
class FakeBucket implements BackupObjectStorage {
  readonly location = 's3://bucket-teste/backups/';
  objects = new Map<string, string>();
  failWrites = false;

  async put(key: string, body: string) {
    if (this.failWrites) throw new Error('503 Service Unavailable');
    this.objects.delete(key);
    this.objects.set(key, body);
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async listRecent(limit: number) {
    return [...this.objects.keys()].reverse().slice(0, limit);
  }
}

async function createBackup() {
  const res = await adminRequest('/api/backups', { method: 'POST' });
  return { status: res.status, body: await res.json() as any };
}

describe('Backups cifrados fora do processo (object storage)', () => {
  let bucket: FakeBucket;

  beforeEach(() => {
    db.clear();
    backupStore.clear();
    bucket = new FakeBucket();
    BackupService.useObjectStorage(bucket);
  });

  afterEach(() => {
    BackupService.useObjectStorage(null);
    backupStore.clear();
  });

  it('envia o snapshot cifrado ao bucket, sem dados em claro', async () => {
    const { status, body } = await createBackup();
    expect(status).toBe(201);
    expect(body.backup.storageLocation).toBe('OBJECT_STORAGE');

    const stored = bucket.objects.get(backupObjectKey(body.backup.id));
    expect(stored).toBeDefined();
    const file = JSON.parse(stored!);
    expect(file.backupMetadata.checksumSha256).toBe(body.backup.checksumSha256);
    expect(file.envelope.encryptedDek).toBeString();
    // O dump vai cifrado: e-mails do seed não aparecem no objeto
    expect(stored).not.toContain('@terapiainfoco.com.br');
  });

  it('sobrevive a um restart: o boot recarrega os snapshots do bucket', async () => {
    const { body } = await createBackup();
    backupStore.clear(); // processo reiniciado

    expect(await BackupService.hydrateFromObjectStorage()).toBe(1);
    const overview = BackupService.getBackupOverview();
    expect(overview.backups.map((b) => b.id)).toEqual([body.backup.id]);
    expect(overview.storage).toEqual({ offsite: true, location: bucket.location });
  });

  it('verifica um snapshot que só está no bucket e grava o resultado de volta', async () => {
    const { body } = await createBackup();
    backupStore.clear();

    const res = await adminRequest(`/api/backups/${body.backup.id}/verify`, { method: 'POST' });
    expect(res.status).toBe(200);

    const file = JSON.parse(bucket.objects.get(backupObjectKey(body.backup.id))!);
    expect(file.backupMetadata.status).toBe('VERIFIED');
    expect(file.backupMetadata.verifiedAt).toBeString();

    const download = await adminRequest(`/api/backups/${body.backup.id}/download`);
    expect(download.status).toBe(200);
  });

  it('falha o backup quando o envio ao bucket falha (não fica só na memória)', async () => {
    bucket.failWrites = true;
    const { status, body } = await createBackup();
    expect(status).toBe(500);
    expect(body.error).toContain('object storage');
    expect(BackupService.getBackupOverview().totalBackups).toBe(0);
  });

  it('sem bucket configurado o snapshot é marcado como só em memória', async () => {
    BackupService.useObjectStorage(null);
    const { body } = await createBackup();
    expect(body.backup.storageLocation).toBe('MEMORY_ONLY');
    expect(BackupService.getBackupOverview().storage).toEqual({ offsite: false, location: null });
  });
});
