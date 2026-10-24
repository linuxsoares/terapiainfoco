import { describe, it, expect, beforeEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { encryptField } from '../src/services/cryptoContext';
import { agendaPeriodRange } from '../src/services/appointmentService';
import { AppointmentRepository } from '../src/repositories/appointmentRepository';
import { AppointmentStatus, UserRole, type StoredAppointment } from '@terapiainfoco/shared';
import { resetDb, seedDemoSession, listUsers, upsertAppointment, upsertPatient, requirePatient } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('Grade de atendimento paginada', () => {
  const tokens = new Map<UserRole, string>();
  let otherPatientId: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    await AppointmentRepository.deleteAll();
    const users = await listUsers();
    for (const role of [UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.PACIENTE]) {
      tokens.set(role, (await authService.issueTokens(users.find((u) => u.role === role)!, '127.0.0.1')).accessToken);
    }
    otherPatientId = randomUUID();
    await upsertPatient({ ...(await requirePatient(DEMO_PATIENT_ID)), id: otherPatientId, emailBindex: 'bindex-angela', cpfBindex: 'bindex-cpf-angela', linkedUserId: undefined, encryptedName: encryptField('Ângela Souza') });

    // Meio-dia de hoje em Brasília como referência, para não depender do horário do teste
    const noonToday = agendaPeriodRange('today', new Date()).from!.getTime() + 12 * HOUR;
    const make = async (key: string, offsetMs: number, overrides: Partial<StoredAppointment> = {}) => {
      const start = new Date(noonToday + offsetMs);
      ids[key] = (await upsertAppointment({
        id: randomUUID(), therapistId: 'therapist-001', patientId: DEMO_PATIENT_ID,
        scheduledStart: start, scheduledEnd: new Date(start.getTime() + 50 * 60_000),
        status: AppointmentStatus.CONFIRMADA, createdAt: new Date(noonToday - 30 * DAY), ...overrides
      })).id;
    };
    await make('today', 0);
    await make('in3days', 3 * DAY, { patientId: otherPatientId });
    await make('in10days', 10 * DAY);
    await make('past5', -5 * DAY, { status: AppointmentStatus.CONCLUIDA });
    await make('pastCanceledByPatient', -2 * DAY, { status: AppointmentStatus.CANCELADA_PELO_PACIENTE });
    await make('pastCanceledByTherapist', -3 * DAY, { status: AppointmentStatus.CANCELADA_PELO_TERAPEUTA });
  });

  const agenda = async (params: Record<string, string> = {}, role = UserRole.PSICOLOGO_TITULAR) => {
    const res = await app.request(`/api/appointments/agenda?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${tokens.get(role)}` } });
    return { status: res.status, body: await res.json() as any };
  };
  const idsOf = (body: any) => body.appointments.map((a: any) => a.id);

  it('padrão: próximos 7 dias, mais recentes primeiro, com nome do paciente', async () => {
    const { body } = await agenda();
    expect(idsOf(body)).toEqual([ids.in3days, ids.today]);
    expect(body.total).toBe(2);
    expect(body.appointments[0].patientName).toBe('Ângela Souza');
  });

  it('períodos: hoje, anteriores e todas', async () => {
    expect(idsOf((await agenda({ period: 'today' })).body)).toEqual([ids.today]);
    expect(idsOf((await agenda({ period: 'past', order: 'oldest' })).body)).toEqual([ids.past5, ids.pastCanceledByTherapist, ids.pastCanceledByPatient]);
    expect((await agenda({ period: 'all' })).body.total).toBe(6);
  });

  it('status "Canceladas" junta os dois tipos e as contagens ignoram o filtro de status', async () => {
    const { body } = await agenda({ period: 'all', status: 'CANCELADA' });
    expect(idsOf(body).sort()).toEqual([ids.pastCanceledByPatient, ids.pastCanceledByTherapist].sort());
    expect(body.total).toBe(2);
    expect(body.statusCounts).toMatchObject({ CANCELADA: 2, CONFIRMADA: 3, CONCLUIDA: 1 });
    expect(body.periodTotal).toBe(6);
  });

  it('paginação com "carregar mais"', async () => {
    const first = (await agenda({ period: 'all', limit: '4' })).body;
    expect(first.appointments).toHaveLength(4);
    expect(first.hasMore).toBe(true);
    const second = (await agenda({ period: 'all', limit: '4', offset: '4' })).body;
    expect(second.appointments).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(new Set([...idsOf(first), ...idsOf(second)]).size).toBe(6);
  });

  it('busca pelo nome do paciente sem diferenciar acentos', async () => {
    const { body } = await agenda({ period: 'all', q: 'angela' });
    expect(idsOf(body)).toEqual([ids.in3days]);
    expect((await agenda({ period: 'all', q: 'ninguem' })).body.total).toBe(0);
  });

  it('recepção acessa; paciente não', async () => {
    expect((await agenda({}, UserRole.RECEPCAO_SECRETARIA)).status).toBe(200);
    expect((await agenda({}, UserRole.PACIENTE)).status).toBe(403);
  });
});
