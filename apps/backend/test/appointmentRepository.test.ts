import { describe, it, expect, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { AppointmentStatus, RecurrenceFrequency, ReminderDeliveryStatus, type StoredAppointment } from '@terapiainfoco/shared';
import { getDb } from '../src/db';
import { encode } from '../src/db/persistence';
import { moveOutOfEntityStore } from '../src/db/sync';
import { AppointmentRepository } from '../src/repositories/appointmentRepository';
import { AppointmentService } from '../src/services/appointmentService';
import { resetDb } from './helpers/db';

const context = { actorId: 'therapist-001', ipAddress: '127.0.0.1' };
const HOUR = 3600000;

function appointment(overrides: Partial<StoredAppointment>): StoredAppointment {
  const start = new Date(Date.now() + 48 * HOUR);
  return {
    id: crypto.randomUUID(),
    therapistId: 'consultorio-a',
    patientId: 'paciente-a',
    scheduledStart: start,
    scheduledEnd: new Date(start.getTime() + 50 * 60000),
    status: AppointmentStatus.CONFIRMADA,
    createdAt: new Date(),
    ...overrides
  };
}

describe('AppointmentRepository (ADR-004 fase 2)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('save grava status, série e lembrete', async () => {
    const created = await AppointmentRepository.create(appointment({}));
    created.status = AppointmentStatus.EM_ANDAMENTO;
    created.seriesId = 'series_x';
    created.sequenceNumber = 2;
    created.totalInSeries = 4;
    created.recurrenceFrequency = RecurrenceFrequency.WEEKLY;
    created.reminderStatus = ReminderDeliveryStatus.SENT;
    created.lastReminderSentAt = new Date('2026-10-21T12:00:00Z');
    await AppointmentRepository.save(created);

    const reloaded = (await AppointmentRepository.findById(created.id))!;
    expect(reloaded.status).toBe(AppointmentStatus.EM_ANDAMENTO);
    expect(reloaded).toMatchObject({ seriesId: 'series_x', sequenceNumber: 2, totalInSeries: 4, recurrenceFrequency: RecurrenceFrequency.WEEKLY });
    expect(new Date(reloaded.lastReminderSentAt!).toISOString()).toBe('2026-10-21T12:00:00.000Z');
  });

  it('conflito de agenda ignora consultas canceladas e de outros consultórios', async () => {
    const taken = await AppointmentRepository.create(appointment({}));
    const start = new Date(taken.scheduledStart);
    await AppointmentRepository.create(appointment({ scheduledStart: new Date(start.getTime() + 2 * HOUR), scheduledEnd: new Date(start.getTime() + 3 * HOUR), status: AppointmentStatus.CANCELADA_PELO_TERAPEUTA }));
    await AppointmentRepository.create(appointment({ therapistId: 'consultorio-b', scheduledStart: new Date(start.getTime() + 4 * HOUR), scheduledEnd: new Date(start.getTime() + 5 * HOUR) }));

    const dto = (offsetHours: number) => ({
      patientId: 'paciente-a',
      scheduledStart: new Date(start.getTime() + offsetHours * HOUR).toISOString(),
      scheduledEnd: new Date(start.getTime() + offsetHours * HOUR + 50 * 60000).toISOString()
    });
    // Colide com a sessão confirmada (dentro do buffer)
    await expect(AppointmentService.createAppointment('consultorio-a', dto(0.5), context)).rejects.toThrow('Conflito de agenda');
    // Horário de uma sessão cancelada e de outro consultório ficam livres
    expect((await AppointmentService.createAppointment('consultorio-a', dto(2), context)).id).toBeDefined();
    expect((await AppointmentService.createAppointment('consultorio-a', dto(4), context)).id).toBeDefined();
  });

  it('série recorrente é gravada e cancelada no banco', async () => {
    const start = new Date(Date.now() + 72 * HOUR);
    const series = await AppointmentService.createRecurrentAppointments('consultorio-a', {
      patientId: 'paciente-a',
      scheduledStart: start.toISOString(),
      scheduledEnd: new Date(start.getTime() + 50 * 60000).toISOString(),
      recurrence: { frequency: RecurrenceFrequency.WEEKLY, count: 3 }
    }, context);

    const stored = await AppointmentRepository.list({ seriesId: series.seriesId });
    expect(stored.map((a) => a.sequenceNumber)).toEqual([1, 2, 3]);

    expect((await AppointmentService.cancelSeries(series.seriesId, context)).canceledCount).toBe(3);
    const canceled = await AppointmentRepository.list({ seriesId: series.seriesId });
    expect(canceled.every((a) => a.status === AppointmentStatus.CANCELADA_PELO_TERAPEUTA)).toBe(true);
  });

  it('consultas antigas do entity_store vão para a tabela e substituem a linha legada de mesmo id', async () => {
    const db: any = await getDb();
    const legacy = await AppointmentRepository.create(appointment({ status: AppointmentStatus.CONFIRMADA }));
    const current = appointment({ id: legacy.id, status: AppointmentStatus.CONCLUIDA, seriesId: 'series_y' });
    await db.execute(sql`INSERT INTO entity_store (collection, id, data) VALUES ('appointments', ${current.id}, ${encode(current)}::jsonb)`);

    expect(await moveOutOfEntityStore(db, 'appointments')).toBe(1);
    const moved = (await AppointmentRepository.findById(legacy.id))!;
    expect(moved.status).toBe(AppointmentStatus.CONCLUIDA);
    expect(moved.seriesId).toBe('series_y');
    const left = await db.execute(sql`SELECT count(*)::int AS n FROM entity_store WHERE collection = 'appointments'`);
    expect((left.rows ?? left)[0].n).toBe(0);
  });
});
