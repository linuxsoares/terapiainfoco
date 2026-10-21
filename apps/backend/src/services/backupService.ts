import { createHash, randomUUID } from 'node:crypto';
import { 
  type BackupSnapshotMetadata,
  type BackupSnapshotFile,
  type BackupOverviewResponse,
  type CreateBackupResponse,
  type VerifyBackupResponse,
  type RestoreBackupResponse,
  type BackupEntitiesSummary,
  AuditAction,
  AuditResourceType,
  type EnvelopeEncryptedData
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { UserRepository } from '../repositories/userRepository';
import { PatientRepository } from '../repositories/patientRepository';
import { envelopeService } from './cryptoContext';
import { AuditService } from './auditService';
import { backupObjectKey, createBackupObjectStorage, type BackupObjectStorage } from './backupObjectStorage';

interface StoredBackupSnapshot {
  metadata: BackupSnapshotMetadata;
  envelope: EnvelopeEncryptedData;
}

/** Snapshots mantidos na memória do processo (os mais recentes); o histórico completo fica no object storage */
const MEMORY_RETENTION = 20;

/**
 * Cache em memória dos backups criptografados
 */
class BackupStore {
  private snapshots: Map<string, StoredBackupSnapshot> = new Map();
  private maxRetention = MEMORY_RETENTION;

  get(id: string): StoredBackupSnapshot | undefined {
    return this.snapshots.get(id);
  }

  save(snapshot: StoredBackupSnapshot) {
    this.snapshots.set(snapshot.metadata.id, snapshot);

    // Rotação automática de retenção (remove os mais antigos se ultrapassar o limite)
    if (this.snapshots.size > this.maxRetention) {
      const sorted = Array.from(this.snapshots.values()).sort(
        (a, b) => new Date(a.metadata.createdAt).getTime() - new Date(b.metadata.createdAt).getTime()
      );
      while (sorted.length > this.maxRetention) {
        const oldest = sorted.shift();
        if (oldest) this.snapshots.delete(oldest.metadata.id);
      }
    }
  }

  list(): StoredBackupSnapshot[] {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
    );
  }

  clear() {
    this.snapshots.clear();
  }
}

export const backupStore = new BackupStore();

function toSnapshotFile(stored: StoredBackupSnapshot): BackupSnapshotFile {
  return { backupMetadata: stored.metadata, envelope: stored.envelope };
}

export class BackupService {
  private static objectStorage: BackupObjectStorage | null = createBackupObjectStorage();

  /** Troca o destino durável (testes injetam um storage em memória; null desliga) */
  static useObjectStorage(storage: BackupObjectStorage | null): void {
    this.objectStorage = storage;
  }

  static isOffsite(): boolean {
    return this.objectStorage !== null;
  }

  /**
   * Recarrega no boot os snapshots mais recentes do object storage (só os metadados e envelopes cifrados).
   */
  static async hydrateFromObjectStorage(): Promise<number> {
    if (!this.objectStorage) return 0;
    const keys = await this.objectStorage.listRecent(MEMORY_RETENTION);
    let loaded = 0;
    for (const key of keys) {
      const body = await this.objectStorage.get(key);
      if (!body) continue;
      const file = JSON.parse(body) as BackupSnapshotFile;
      backupStore.save({ metadata: file.backupMetadata, envelope: file.envelope });
      loaded++;
    }
    return loaded;
  }

  /** Busca o snapshot na memória e, se não estiver lá (restart ou fora da retenção), no object storage */
  private static async load(backupId: string): Promise<StoredBackupSnapshot | undefined> {
    const cached = backupStore.get(backupId);
    if (cached || !this.objectStorage) return cached;
    const body = await this.objectStorage.get(backupObjectKey(backupId));
    if (!body) return undefined;
    const file = JSON.parse(body) as BackupSnapshotFile;
    return { metadata: file.backupMetadata, envelope: file.envelope };
  }

  /** Regrava o snapshot no object storage para que o resultado da verificação também seja durável */
  private static async persistMetadata(stored: StoredBackupSnapshot): Promise<void> {
    if (!this.objectStorage) return;
    try {
      await this.objectStorage.put(backupObjectKey(stored.metadata.id), JSON.stringify(toSnapshotFile(stored)));
    } catch (err) {
      console.error(`⚠️ Não foi possível atualizar o snapshot ${stored.metadata.id} no object storage:`, err);
    }
  }

  /**
   * Captura o estado completo do banco de dados e gera snapshot cifrado por Envelope Encryption com KMS
   */
  static async createEncryptedBackup(context: {
    actorId: string;
    ipAddress: string;
    userAgent?: string;
  }): Promise<CreateBackupResponse> {
    // 1. Extração de todas as tabelas e coleções relacionais
    const therapists = Array.from(db.therapists.values());
    const patients = await PatientRepository.list();
    const appointments = Array.from(db.appointments.values());
    const clinicalRecords = Array.from(db.clinicalRecords.values());
    const documents = Array.from(db.documents.values());
    const sessionTranscriptions = Array.from(db.sessionTranscriptions.values());
    const users = await UserRepository.list();
    const auditLogs = [...db.auditLogs];

    const entitiesCount: BackupEntitiesSummary = {
      therapists: therapists.length,
      patients: patients.length,
      appointments: appointments.length,
      clinicalRecords: clinicalRecords.length,
      documents: documents.length,
      sessionTranscriptions: sessionTranscriptions.length,
      users: users.length,
      auditLogs: auditLogs.length,
      totalEntities:
        therapists.length +
        patients.length +
        appointments.length +
        clinicalRecords.length +
        documents.length +
        sessionTranscriptions.length +
        users.length +
        auditLogs.length
    };

    // 2. Dump estruturado canônico
    const rawDump = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      databaseVersion: 'drizzle-pglite-rfc001-v1',
      data: {
        therapists,
        patients,
        appointments,
        clinicalRecords,
        documents,
        sessionTranscriptions,
        users,
        auditLogs
      }
    };

    const dumpJson = JSON.stringify(rawDump);

    // 3. Criptografia em Repouso via Envelope Encryption (KMS)
    // Uma nova DEK aleatória é gerada, o dump é cifrado em AES-256-GCM e a DEK é envelopada pela KEK mestre
    const envelope = await envelopeService.encrypt(dumpJson);

    // 4. Checksum SHA-256 canônico de integridade do envelope cifrado
    const checksumPayload = `${envelope.encryptedDek}|${envelope.payload.iv}|${envelope.payload.authTag}|${envelope.payload.ciphertext}`;
    const checksumSha256 = createHash('sha256').update(checksumPayload).digest('hex');

    const backupId = randomUUID();
    const createdAt = new Date().toISOString();

    const metadata: BackupSnapshotMetadata = {
      id: backupId,
      createdAt,
      databaseVersion: 'drizzle-pglite-rfc001-v1',
      sizeBytes: Buffer.byteLength(envelope.payload.ciphertext, 'utf8'),
      checksumSha256,
      entitiesCount,
      status: 'COMPLETED',
      verifiedAt: null,
      verificationDetails: null,
      storageLocation: this.objectStorage ? 'OBJECT_STORAGE' : 'MEMORY_ONLY'
    };

    // 5. Persistência: object storage (durável, fora do processo) e cache em memória.
    // Sem o envio ao bucket o backup não vale como cópia de segurança, então a falha é propagada.
    const stored: StoredBackupSnapshot = { metadata, envelope };
    if (this.objectStorage) {
      try {
        await this.objectStorage.put(backupObjectKey(backupId), JSON.stringify(toSnapshotFile(stored)));
      } catch (err: any) {
        throw new Error(`Falha ao enviar o snapshot cifrado ao object storage: ${err?.message || err}`);
      }
    }
    backupStore.save(stored);

    // 6. Registro imutável na trilha de auditoria WORM
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: backupId,
      action: AuditAction.BACKUP_CREATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      success: true,
      backup: metadata,
      message: 'Snapshot de backup gerado e criptografado com sucesso via Master Key (Cloud KMS / Envelope Encryption).'
    };
  }

  /**
   * Executa simulação de Disaster Recovery e verificação de integridade criptográfica (Dry-Run Restore)
   */
  static async verifyBackup(
    backupId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<VerifyBackupResponse> {
    const stored = await this.load(backupId);
    if (!stored) {
      throw new Error(`Snapshot de backup ${backupId} não encontrado no repositório.`);
    }

    const startTime = performance.now();

    try {
      // 1. Verificação do Checksum SHA-256
      const checksumPayload = `${stored.envelope.encryptedDek}|${stored.envelope.payload.iv}|${stored.envelope.payload.authTag}|${stored.envelope.payload.ciphertext}`;
      const recalculatedHash = createHash('sha256').update(checksumPayload).digest('hex');

      if (recalculatedHash !== stored.metadata.checksumSha256) {
        stored.metadata.status = 'FAILED';
        throw new Error('Falha de integridade: Checksum SHA-256 do snapshot corrompido.');
      }

      // 2. Abertura segura da DEK pelo KMS e validação da Auth Tag AES-256-GCM
      const decryptedDumpJson = await envelopeService.decrypt(stored.envelope);
      const parsed = JSON.parse(decryptedDumpJson);

      if (!parsed.data || !Array.isArray(parsed.data.patients)) {
        stored.metadata.status = 'FAILED';
        throw new Error('Falha estrutural: Dump decifrado não possui o esquema de dados esperado.');
      }

      const verificationTimeMs = Math.round(performance.now() - startTime);
      const verifiedAt = new Date().toISOString();

      stored.metadata.status = 'VERIFIED';
      stored.metadata.verifiedAt = verifiedAt;
      stored.metadata.verificationDetails = {
        verificationTimeMs,
        totalRecordsVerified: stored.metadata.entitiesCount.totalEntities,
        gcmAuthTagValid: true,
        sha256ChecksumValid: true
      };

      await this.persistMetadata(stored);

      // 3. Registro do teste de DR na trilha WORM
      AuditService.log({
        actorId: context.actorId,
        resourceType: AuditResourceType.SECURITY,
        resourceId: backupId,
        action: AuditAction.BACKUP_VERIFY,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      });

      return {
        success: true,
        backupId,
        verifiedAt,
        integrityOk: true,
        verificationTimeMs,
        entitiesVerified: stored.metadata.entitiesCount,
        message: 'Simulação de Disaster Recovery concluída com sucesso. Integridade de 100% dos dados validada pelo KMS.'
      };
    } catch (err: any) {
      stored.metadata.status = 'FAILED';
      await this.persistMetadata(stored);
      throw new Error(`Erro na verificação do backup: ${err.message}`);
    }
  }

  /**
   * Restauração emergencial do banco de dados a partir de um backup verificado (Disaster Recovery Restore)
   * Restrito estritamente a perfil Administrador
   */
  static async restoreFromBackup(
    backupId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<RestoreBackupResponse> {
    const stored = await this.load(backupId);
    if (!stored) {
      throw new Error(`Snapshot de backup ${backupId} não encontrado no repositório.`);
    }

    // 1. Decifra o dump através do KMS
    const decryptedDumpJson = await envelopeService.decrypt(stored.envelope);
    const dump = JSON.parse(decryptedDumpJson);

    if (!dump.data) {
      throw new Error('Dump corrompido ou incompatível.');
    }

    // 2. Restabelecimento completo do banco de dados em memória / produção
    db.therapists.clear();
    for (const t of dump.data.therapists || []) {
      db.therapists.set(t.id, t);
    }

    await PatientRepository.deleteAll();
    await PatientRepository.upsertMany(dump.data.patients || []);

    db.appointments.clear();
    for (const a of dump.data.appointments || []) {
      db.appointments.set(a.id, a);
    }

    db.clinicalRecords.clear();
    for (const r of dump.data.clinicalRecords || []) {
      db.clinicalRecords.set(r.id, r);
    }

    db.documents.clear();
    for (const d of dump.data.documents || []) {
      db.documents.set(d.id, d);
    }

    db.sessionTranscriptions.clear();
    for (const s of dump.data.sessionTranscriptions || []) {
      db.sessionTranscriptions.set(s.id, s);
    }

    await UserRepository.deleteAll();
    await UserRepository.upsertMany(dump.data.users || []);

    db.auditLogs = [...(dump.data.auditLogs || [])];

    const restoredAt = new Date().toISOString();

    // 3. Registro mandatório da restauração na trilha WORM
    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.SECURITY,
      resourceId: backupId,
      action: AuditAction.BACKUP_RESTORE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      success: true,
      backupId,
      restoredAt,
      entitiesRestored: stored.metadata.entitiesCount,
      message: `Restauração emergencial de desastre concluída com sucesso. ${stored.metadata.entitiesCount.totalEntities} registros restabelecidos.`
    };
  }

  /**
   * Visão Geral, Indicadores de RPO/RTO e Histórico de Backups
   */
  static getBackupOverview(): BackupOverviewResponse {
    const list = backupStore.list();
    const lastBackupAt = list.length > 0 ? list[0].metadata.createdAt : null;

    const verifiedBackups = list.filter(b => b.metadata.verifiedAt != null);
    const lastVerifiedAt = verifiedBackups.length > 0 ? verifiedBackups[0].metadata.verifiedAt! : null;

    let rpoHours = 0;
    if (lastBackupAt) {
      rpoHours = (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60);
    }

    // Calcula média de tempo das simulações de verificação (RTO medido em milissegundos)
    const times = verifiedBackups
      .map(b => b.metadata.verificationDetails?.verificationTimeMs || 0)
      .filter(t => t > 0);
    const rtoEstimateMs = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 45;

    return {
      success: true,
      lastBackupAt,
      lastVerifiedAt,
      totalBackups: list.length,
      rpoHours: Math.round(rpoHours * 10) / 10,
      rtoEstimateMs,
      isRpoCompliant: rpoHours <= 24,
      backups: list.map(b => b.metadata),
      storage: { offsite: this.isOffsite(), location: this.objectStorage?.location ?? null }
    };
  }

  /**
   * Obtém arquivo completo do snapshot cifrado para exportação / download
   */
  static async getBackupFile(backupId: string): Promise<BackupSnapshotFile | null> {
    const stored = await this.load(backupId);
    return stored ? toSnapshotFile(stored) : null;
  }
}
