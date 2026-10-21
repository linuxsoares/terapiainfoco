import { and, asc, count, eq, or, sql, type SQL } from 'drizzle-orm';
import { getDb, schema, type AppDb } from '../db';
import type { StoredPatient } from '@terapiainfoco/shared';

/**
 * Repositório SQL dos pacientes (ADR-004 fase 2): a tabela `patients` é a fonte de verdade,
 * sem cópia no cache em memória. PII continua cifrada (FLE) e as buscas exatas usam os
 * blind indexes. Alterações só valem depois de `save`.
 */

type PatientRow = typeof schema.patients.$inferSelect;
type PatientInsert = typeof schema.patients.$inferInsert;

function toDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toPatient(row: PatientRow): StoredPatient {
  return {
    id: row.id,
    therapistId: row.therapistId,
    linkedUserId: row.linkedUserId ?? undefined,
    emailBindex: row.emailBindex,
    cpfBindex: row.cpfBindex ?? undefined,
    consentTranscriptionSigned: row.consentTranscriptionSigned,
    consentSignedAt: row.consentSignedAt,
    consentRevokedAt: row.consentRevokedAt ?? undefined,
    consentRevokeReason: row.consentRevokeReason ?? undefined,
    createdAt: row.createdAt,
    encryptedName: row.encryptedName,
    encryptedEmail: row.encryptedEmail,
    encryptedPhone: row.encryptedPhone,
    encryptedCpf: row.encryptedCpf ?? undefined
  };
}

function toRow(patient: StoredPatient): PatientInsert {
  return {
    id: patient.id,
    therapistId: patient.therapistId,
    linkedUserId: patient.linkedUserId ?? null,
    emailBindex: patient.emailBindex,
    cpfBindex: patient.cpfBindex ?? null,
    consentTranscriptionSigned: patient.consentTranscriptionSigned,
    consentSignedAt: toDate(patient.consentSignedAt),
    consentRevokedAt: toDate(patient.consentRevokedAt),
    consentRevokeReason: patient.consentRevokeReason ?? null,
    createdAt: toDate(patient.createdAt) ?? new Date(),
    encryptedName: patient.encryptedName,
    encryptedEmail: patient.encryptedEmail,
    encryptedPhone: patient.encryptedPhone,
    encryptedCpf: patient.encryptedCpf ?? null
  };
}

export interface PatientListFilter {
  therapistId?: string;
}

export const PatientRepository = {
  async findById(id: string): Promise<StoredPatient | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.patients).where(eq(schema.patients.id, id));
    return row ? toPatient(row) : null;
  },

  async list(filter: PatientListFilter = {}): Promise<StoredPatient[]> {
    const conditions: SQL[] = [];
    if (filter.therapistId) conditions.push(eq(schema.patients.therapistId, filter.therapistId));
    const db: any = await getDb();
    const rows: PatientRow[] = await db.select().from(schema.patients)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(schema.patients.createdAt));
    return rows.map(toPatient);
  },

  /** Registros de uma conta de paciente: o principal (`user.patientId`) e os criados ao agendar pelo portal */
  async listForPatientAccount(userId: string, patientId?: string): Promise<StoredPatient[]> {
    const ownership = patientId
      ? or(eq(schema.patients.linkedUserId, userId), eq(schema.patients.id, patientId))
      : eq(schema.patients.linkedUserId, userId);
    const db: any = await getDb();
    const rows: PatientRow[] = await db.select().from(schema.patients).where(ownership)
      .orderBy(asc(schema.patients.createdAt));
    return rows.map(toPatient);
  },

  /** Busca exata pelo blind index do CPF; com therapistId, restrita ao consultório */
  async findByCpfBindex(cpfBindex: string, therapistId?: string): Promise<StoredPatient | null> {
    const conditions: SQL[] = [eq(schema.patients.cpfBindex, cpfBindex)];
    if (therapistId) conditions.push(eq(schema.patients.therapistId, therapistId));
    const db: any = await getDb();
    const [row] = await db.select().from(schema.patients).where(and(...conditions))
      .orderBy(asc(schema.patients.createdAt)).limit(1);
    return row ? toPatient(row) : null;
  },

  /** Busca exata pelo blind index do e-mail; com therapistId, restrita ao consultório */
  async findByEmailBindex(emailBindex: string, therapistId?: string): Promise<StoredPatient | null> {
    const conditions: SQL[] = [eq(schema.patients.emailBindex, emailBindex)];
    if (therapistId) conditions.push(eq(schema.patients.therapistId, therapistId));
    const db: any = await getDb();
    const [row] = await db.select().from(schema.patients).where(and(...conditions))
      .orderBy(asc(schema.patients.createdAt)).limit(1);
    return row ? toPatient(row) : null;
  },

  /** Ids dos pacientes de um consultório */
  async idsByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.select({ id: schema.patients.id }).from(schema.patients)
      .where(eq(schema.patients.therapistId, therapistId));
    return new Set(rows.map((row) => row.id));
  },

  async count(): Promise<number> {
    const db: any = await getDb();
    const [row] = await db.select({ total: count() }).from(schema.patients);
    return Number(row?.total ?? 0);
  },

  async create(patient: StoredPatient): Promise<StoredPatient> {
    const db: any = await getDb();
    const [row] = await db.insert(schema.patients).values(toRow(patient)).returning();
    return toPatient(row);
  },

  /** Grava o estado completo do paciente (padrão: carregar, alterar e salvar) */
  async save(patient: StoredPatient): Promise<StoredPatient> {
    const { id, createdAt, ...changes } = toRow(patient);
    const db: any = await getDb();
    const [row] = await db.update(schema.patients).set(changes).where(eq(schema.patients.id, id)).returning();
    if (!row) throw new Error(`Paciente ${id} não encontrado.`);
    return toPatient(row);
  },

  async delete(id: string): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.patients).where(eq(schema.patients.id, id));
  },

  /**
   * Insere ou substitui pacientes (importação do entity_store e restauração de backup).
   * Durante a inicialização do banco recebe a conexão, pois `getDb()` ainda não resolveu.
   */
  async upsertMany(patients: StoredPatient[], connection?: AppDb): Promise<void> {
    if (patients.length === 0) return;
    const db: any = connection ?? await getDb();
    const rows = patients.map(toRow);
    await db.insert(schema.patients).values(rows).onConflictDoUpdate({
      target: schema.patients.id,
      set: Object.fromEntries(
        Object.keys(rows[0]!).filter((key) => key !== 'id').map((key) => {
          const column = (schema.patients as any)[key];
          return [key, sql.raw(`excluded."${column.name}"`)];
        })
      )
    });
  },

  /** Insere só os pacientes cujo id ainda não existe (aceita a conexão da inicialização) */
  async insertMissing(patients: StoredPatient[], connection?: AppDb): Promise<void> {
    if (patients.length === 0) return;
    const db: any = connection ?? await getDb();
    await db.insert(schema.patients).values(patients.map(toRow)).onConflictDoNothing();
  },

  /** Apaga os pacientes de um consultório e devolve os ids removidos */
  async deleteByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.delete(schema.patients)
      .where(eq(schema.patients.therapistId, therapistId)).returning({ id: schema.patients.id });
    return new Set(rows.map((row) => row.id));
  },

  async deleteAll(): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.patients);
  }
};
