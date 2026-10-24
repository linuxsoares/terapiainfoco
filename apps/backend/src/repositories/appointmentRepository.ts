import { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import { getDb, schema, type AppDb } from '../db';
import {
  AppointmentStatus,
  SessionPaymentStatus,
  type PaymentMethod,
  type RecurrenceFrequency,
  type ReminderDeliveryStatus,
  type StoredAppointment
} from '@terapiainfoco/shared';

/**
 * Repositório SQL das consultas (ADR-004 fase 2): a tabela `appointments` é a fonte de verdade,
 * sem cópia no cache em memória. Alterações só valem depois de `save`.
 */

type AppointmentRow = typeof schema.appointments.$inferSelect;
type AppointmentInsert = typeof schema.appointments.$inferInsert;

/** Consultas canceladas não ocupam a agenda */
const CANCELED_STATUSES = [AppointmentStatus.CANCELADA_PELO_PACIENTE, AppointmentStatus.CANCELADA_PELO_TERAPEUTA];

function toDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toAppointment(row: AppointmentRow): StoredAppointment {
  return {
    id: row.id,
    therapistId: row.therapistId,
    patientId: row.patientId,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    status: row.status as AppointmentStatus,
    seriesId: row.seriesId ?? undefined,
    sequenceNumber: row.sequenceNumber ?? undefined,
    totalInSeries: row.totalInSeries ?? undefined,
    recurrenceFrequency: (row.recurrenceFrequency as RecurrenceFrequency | null) ?? undefined,
    reminderStatus: (row.reminderStatus as ReminderDeliveryStatus | null) ?? undefined,
    lastReminderSentAt: row.lastReminderSentAt ?? undefined,
    patientConfirmedAt: row.patientConfirmedAt ?? undefined,
    feeCents: row.feeCents ?? undefined,
    paymentStatus: row.paymentStatus as SessionPaymentStatus,
    paidAt: row.paidAt ?? undefined,
    paymentMethod: (row.paymentMethod as PaymentMethod | null) ?? undefined,
    encryptedPayer: row.encryptedPayer ?? undefined,
    receitaSaudeIssuedAt: row.receitaSaudeIssuedAt ?? undefined,
    createdAt: row.createdAt
  };
}

function toRow(appointment: StoredAppointment): AppointmentInsert {
  return {
    id: appointment.id,
    therapistId: appointment.therapistId,
    patientId: appointment.patientId,
    scheduledStart: new Date(appointment.scheduledStart),
    scheduledEnd: new Date(appointment.scheduledEnd),
    status: appointment.status,
    seriesId: appointment.seriesId ?? null,
    sequenceNumber: appointment.sequenceNumber ?? null,
    totalInSeries: appointment.totalInSeries ?? null,
    recurrenceFrequency: appointment.recurrenceFrequency ?? null,
    reminderStatus: appointment.reminderStatus ?? null,
    lastReminderSentAt: toDate(appointment.lastReminderSentAt),
    patientConfirmedAt: toDate(appointment.patientConfirmedAt),
    feeCents: appointment.feeCents ?? null,
    paymentStatus: appointment.paymentStatus ?? SessionPaymentStatus.PENDING,
    paidAt: appointment.paidAt ?? null,
    paymentMethod: appointment.paymentMethod ?? null,
    encryptedPayer: appointment.encryptedPayer ?? null,
    receitaSaudeIssuedAt: toDate(appointment.receitaSaudeIssuedAt),
    createdAt: toDate(appointment.createdAt) ?? new Date()
  };
}

export interface AppointmentListFilter {
  therapistId?: string;
  patientIds?: string[];
  seriesId?: string;
}

export const AppointmentRepository = {
  async findById(id: string): Promise<StoredAppointment | null> {
    const db: any = await getDb();
    const [row] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id));
    return row ? toAppointment(row) : null;
  },

  /** Consultas em ordem cronológica; `patientIds` vazio não devolve nada */
  async list(filter: AppointmentListFilter = {}): Promise<StoredAppointment[]> {
    if (filter.patientIds && filter.patientIds.length === 0) return [];
    const conditions: SQL[] = [];
    if (filter.therapistId) conditions.push(eq(schema.appointments.therapistId, filter.therapistId));
    if (filter.patientIds) conditions.push(inArray(schema.appointments.patientId, filter.patientIds));
    if (filter.seriesId) conditions.push(eq(schema.appointments.seriesId, filter.seriesId));
    const db: any = await getDb();
    const rows: AppointmentRow[] = await db.select().from(schema.appointments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(schema.appointments.scheduledStart));
    return rows.map(toAppointment);
  },

  /**
   * Página da grade do consultório: período [from, to), status e pacientes opcionais.
   * Devolve também o total filtrado e a contagem por status (sem o filtro de status).
   */
  async listPage(filter: {
    therapistId: string;
    from?: Date;
    to?: Date;
    statuses?: string[];
    patientIds?: string[];
    order: 'newest' | 'oldest';
    limit: number;
    offset: number;
  }): Promise<{ items: StoredAppointment[]; total: number; countsByStatus: Record<string, number> }> {
    const t = schema.appointments;
    if (filter.patientIds && filter.patientIds.length === 0) return { items: [], total: 0, countsByStatus: {} };
    const base: SQL[] = [eq(t.therapistId, filter.therapistId)];
    if (filter.from) base.push(gte(t.scheduledStart, filter.from));
    if (filter.to) base.push(lt(t.scheduledStart, filter.to));
    if (filter.patientIds) base.push(inArray(t.patientId, filter.patientIds));
    const withStatus = filter.statuses?.length ? [...base, inArray(t.status, filter.statuses)] : base;

    const db: any = await getDb();
    const [rows, totalRows, statusRows] = await Promise.all([
      db.select().from(t).where(and(...withStatus))
        .orderBy(filter.order === 'newest' ? desc(t.scheduledStart) : asc(t.scheduledStart))
        .limit(filter.limit).offset(filter.offset),
      db.select({ total: count() }).from(t).where(and(...withStatus)),
      db.select({ status: t.status, total: count() }).from(t).where(and(...base)).groupBy(t.status)
    ]);
    return {
      items: (rows as AppointmentRow[]).map(toAppointment),
      total: Number(totalRows[0]?.total ?? 0),
      countsByStatus: Object.fromEntries((statusRows as { status: string; total: number }[]).map((r) => [r.status, Number(r.total)]))
    };
  },

  /** Consultas não canceladas do consultório que se sobrepõem ao intervalo [from, to) */
  async listActiveOverlapping(therapistId: string, from: Date, to: Date): Promise<StoredAppointment[]> {
    const db: any = await getDb();
    const rows: AppointmentRow[] = await db.select().from(schema.appointments).where(and(
      eq(schema.appointments.therapistId, therapistId),
      notInArray(schema.appointments.status, CANCELED_STATUSES),
      lt(schema.appointments.scheduledStart, to),
      gt(schema.appointments.scheduledEnd, from)
    ));
    return rows.map(toAppointment);
  },

  /**
   * Reserva, de forma atômica, as consultas confirmadas que entram na janela do lembrete
   * (início em até `leadMs`) e ainda não o receberam para o horário atual. Consultas marcadas
   * já dentro da janela ficam de fora: o e-mail de agendamento acabou de chegar.
   * O UPDATE ... RETURNING garante um único envio mesmo com várias instâncias.
   */
  async claimDueReminders(now: Date, leadMs: number): Promise<StoredAppointment[]> {
    const windowEnd = new Date(now.getTime() + leadMs);
    const leadSeconds = Math.round(leadMs / 1000);
    const t = schema.appointments;
    const db: any = await getDb();
    const rows: AppointmentRow[] = await db.update(t)
      .set({ reminderStatus: 'SENT', lastReminderSentAt: now })
      .where(and(
        eq(t.status, AppointmentStatus.CONFIRMADA),
        gt(t.scheduledStart, now),
        lte(t.scheduledStart, windowEnd),
        sql`${t.createdAt} < ${t.scheduledStart} - make_interval(secs => ${leadSeconds})`,
        sql`(${t.lastReminderSentAt} is null or ${t.lastReminderSentAt} < ${t.scheduledStart} - make_interval(secs => ${leadSeconds}))`
      ))
      .returning();
    return rows.map(toAppointment);
  },

  /** Ids das consultas de um consultório */
  async idsByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.select({ id: schema.appointments.id }).from(schema.appointments)
      .where(eq(schema.appointments.therapistId, therapistId));
    return new Set(rows.map((row) => row.id));
  },

  async count(): Promise<number> {
    const db: any = await getDb();
    const [row] = await db.select({ total: count() }).from(schema.appointments);
    return Number(row?.total ?? 0);
  },

  async create(appointment: StoredAppointment): Promise<StoredAppointment> {
    const db: any = await getDb();
    const [row] = await db.insert(schema.appointments).values(toRow(appointment)).returning();
    return toAppointment(row);
  },

  /** Grava o estado completo da consulta (padrão: carregar, alterar e salvar) */
  async save(appointment: StoredAppointment): Promise<StoredAppointment> {
    const { id, createdAt, ...changes } = toRow(appointment);
    const db: any = await getDb();
    const [row] = await db.update(schema.appointments).set(changes).where(eq(schema.appointments.id, id)).returning();
    if (!row) throw new Error(`Consulta ${id} não encontrada.`);
    return toAppointment(row);
  },

  /**
   * Insere ou substitui consultas (importação do entity_store e restauração de backup).
   * Durante a inicialização do banco recebe a conexão, pois `getDb()` ainda não resolveu.
   */
  async upsertMany(appointments: StoredAppointment[], connection?: AppDb): Promise<void> {
    if (appointments.length === 0) return;
    const db: any = connection ?? await getDb();
    const rows = appointments.map(toRow);
    await db.insert(schema.appointments).values(rows).onConflictDoUpdate({
      target: schema.appointments.id,
      set: Object.fromEntries(
        Object.keys(rows[0]!).filter((key) => key !== 'id').map((key) => {
          const column = (schema.appointments as any)[key];
          return [key, sql.raw(`excluded."${column.name}"`)];
        })
      )
    });
  },

  /** Insere só as consultas cujo id ainda não existe (aceita a conexão da inicialização) */
  async insertMissing(appointments: StoredAppointment[], connection?: AppDb): Promise<void> {
    if (appointments.length === 0) return;
    const db: any = connection ?? await getDb();
    await db.insert(schema.appointments).values(appointments.map(toRow)).onConflictDoNothing();
  },

  /** Apaga as consultas de um consultório e devolve os ids removidos */
  async deleteByTherapist(therapistId: string): Promise<Set<string>> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.delete(schema.appointments)
      .where(eq(schema.appointments.therapistId, therapistId)).returning({ id: schema.appointments.id });
    return new Set(rows.map((row) => row.id));
  },

  /** Apaga as consultas de um paciente e devolve os ids removidos */
  async deleteByPatient(patientId: string): Promise<string[]> {
    const db: any = await getDb();
    const rows: { id: string }[] = await db.delete(schema.appointments)
      .where(eq(schema.appointments.patientId, patientId)).returning({ id: schema.appointments.id });
    return rows.map((row) => row.id);
  },

  async deleteAll(): Promise<void> {
    const db: any = await getDb();
    await db.delete(schema.appointments);
  }
};
