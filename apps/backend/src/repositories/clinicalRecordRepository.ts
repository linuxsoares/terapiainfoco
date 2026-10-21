import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getDb, schema, type AppDb } from '../db';
import type { StoredClinicalRecord } from '@terapiainfoco/shared';

/**
 * Repositório SQL dos prontuários SOAP (ADR-004 fase 2): a tabela `clinical_records` é a fonte
 * de verdade, sem cópia no cache em memória. O conteúdo clínico continua cifrado (FLE).
 * Alterações só valem depois de `save`.
 */

type ClinicalRecordRow = typeof schema.clinicalRecords.$inferSelect;
type ClinicalRecordInsert = typeof schema.clinicalRecords.$inferInsert;

function toDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toRecord(row: ClinicalRecordRow): StoredClinicalRecord {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    patientId: row.patientId,
    therapistId: row.therapistId,
    sessionNumber: row.sessionNumber,
    encryptedSoapSubjective: row.encryptedSoapSubjective ?? undefined,
    encryptedSoapObjective: row.encryptedSoapObjective ?? undefined,
    encryptedSoapAssessment: row.encryptedSoapAssessment ?? undefined,
    encryptedSoapPlan: row.encryptedSoapPlan ?? undefined,
    encryptedPrivateNotes: row.encryptedPrivateNotes ?? undefined,
    isSigned: row.isSigned,
    signedAt: row.signedAt,
    signatureHash: row.signatureHash,
    batchClosingManifestId: row.batchClosingManifestId ?? undefined,
    createdAt: row.createdAt
  };
}

function toRow(record: StoredClinicalRecord): ClinicalRecordInsert {
  return {
    id: record.id,
    appointmentId: record.appointmentId,
    patientId: record.patientId,
    therapistId: record.therapistId,
    sessionNumber: record.sessionNumber,
    encryptedSoapSubjective: record.encryptedSoapSubjective ?? null,
    encryptedSoapObjective: record.encryptedSoapObjective ?? null,
    encryptedSoapAssessment: record.encryptedSoapAssessment ?? null,
    encryptedSoapPlan: record.encryptedSoapPlan ?? null,
    encryptedPrivateNotes: record.encryptedPrivateNotes ?? null,
    isSigned: record.isSigned,
    signedAt: toDate(record.signedAt),
    signatureHash: record.signatureHash ?? null,
    batchClosingManifestId: record.batchClosingManifestId ?? null,
    createdAt: toDate(record.createdAt) ?? new Date()
  };
}

export interface ClinicalRecordListFilter {
  therapistId?: string;
  patientIds?: string[];
  appointmentId?: string;
  signed?: boolean;
}

function conditionsFor(filter: ClinicalRecordListFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.therapistId) conditions.push(eq(schema.clinicalRecords.therapistId, filter.therapistId));
  if (filter.patientIds) conditions.push(inArray(schema.clinicalRecords.patientId, filter.patientIds));
  if (filter.appointmentId) conditions.push(eq(schema.clinicalRecords.appointmentId, filter.appointmentId));
  if (filter.signed !== undefined) conditions.push(eq(schema.clinicalRecords.isSigned, filter.signed));
  return conditions;
}

export const ClinicalRecordRepository = {
  async findById(id: string): Promise<StoredClinicalRecord | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.clinicalRecords).where(eq(schema.clinicalRecords.id, id));
    return row ? toRecord(row) : null;
  },

  /** Prontuários em ordem de criação; `patientIds` vazio não devolve nada */
  async list(filter: ClinicalRecordListFilter = {}): Promise<StoredClinicalRecord[]> {
    if (filter.patientIds && filter.patientIds.length === 0) return [];
    const conditions = conditionsFor(filter);
    const db: any = await getDb();
    const rows: ClinicalRecordRow[] = await db.select().from(schema.clinicalRecords)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(schema.clinicalRecords.createdAt));
    return rows.map(toRecord);
  },

  async count(filter: ClinicalRecordListFilter = {}): Promise<number> {
    if (filter.patientIds && filter.patientIds.length === 0) return 0;
    const conditions = conditionsFor(filter);
    const db: any = await getDb();
    const [row] = await db.select({ total: count() }).from(schema.clinicalRecords)
      .where(conditions.length ? and(...conditions) : undefined);
    return Number(row?.total ?? 0);
  },

  /** Ids dos prontuários de um consultório */
  async idsByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.select({ id: schema.clinicalRecords.id }).from(schema.clinicalRecords)
      .where(eq(schema.clinicalRecords.therapistId, therapistId));
    return new Set(rows.map((row) => row.id));
  },

  async create(record: StoredClinicalRecord): Promise<StoredClinicalRecord> {
    const db: any = await getDb();
    const [row] = await db.insert(schema.clinicalRecords).values(toRow(record)).returning();
    return toRecord(row);
  },

  /** Grava o estado completo do prontuário (padrão: carregar, alterar e salvar) */
  async save(record: StoredClinicalRecord): Promise<StoredClinicalRecord> {
    const { id, createdAt, ...changes } = toRow(record);
    const db: any = await getDb();
    const [row] = await db.update(schema.clinicalRecords).set(changes).where(eq(schema.clinicalRecords.id, id)).returning();
    if (!row) throw new Error(`Prontuário ${id} não encontrado.`);
    return toRecord(row);
  },

  /**
   * Insere ou substitui prontuários (importação do entity_store e restauração de backup).
   * Durante a inicialização do banco recebe a conexão, pois `getDb()` ainda não resolveu.
   */
  async upsertMany(records: StoredClinicalRecord[], connection?: AppDb): Promise<void> {
    if (records.length === 0) return;
    const db: any = connection ?? await getDb();
    const rows = records.map(toRow);
    await db.insert(schema.clinicalRecords).values(rows).onConflictDoUpdate({
      target: schema.clinicalRecords.id,
      set: Object.fromEntries(
        Object.keys(rows[0]!).filter((key) => key !== 'id').map((key) => {
          const column = (schema.clinicalRecords as any)[key];
          return [key, sql.raw(`excluded."${column.name}"`)];
        })
      )
    });
  },

  /** Apaga os prontuários de um consultório e devolve os ids removidos */
  async deleteByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.delete(schema.clinicalRecords)
      .where(eq(schema.clinicalRecords.therapistId, therapistId)).returning({ id: schema.clinicalRecords.id });
    return new Set(rows.map((row) => row.id));
  },

  /** Apaga os prontuários de um paciente e devolve os ids removidos */
  async deleteByPatient(patientId: string): Promise<string[]> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.delete(schema.clinicalRecords)
      .where(eq(schema.clinicalRecords.patientId, patientId)).returning({ id: schema.clinicalRecords.id });
    return rows.map((row) => row.id);
  },

  async deleteAll(): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.clinicalRecords);
  }
};
