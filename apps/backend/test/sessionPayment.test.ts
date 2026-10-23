import { describe, it, expect, beforeEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AppointmentService } from '../src/services/appointmentService';
import { clinicToday } from '../src/services/sessionPaymentService';
import { AppointmentStatus, SessionPaymentStatus, UserRole, type StoredAppointment } from '@terapiainfoco/shared';
import { resetDb, seedDemoSession, listUsers, upsertAppointment, requireAppointment } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const DAY = 86_400_000;

describe('Financeiro mínimo: valor, pagamento e contas a receber', () => {
  const tokens = new Map<UserRole, string>();

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    const users = await listUsers();
    for (const role of [UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]) {
      const user = users.find((u) => u.role === role)!;
      tokens.set(role, (await authService.issueTokens(user, '127.0.0.1')).accessToken);
    }
  });

  const headers = (role = UserRole.PSICOLOGO_TITULAR) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(role)}` });
  const pay = (id: string, body: unknown, role?: UserRole) =>
    app.request(`/api/appointments/${id}/payment`, { method: 'PATCH', headers: headers(role), body: JSON.stringify(body) });
  const summary = async (month = clinicToday().slice(0, 7), role?: UserRole) =>
    (await app.request(`/api/finance/summary?month=${month}`, { headers: headers(role) })).json() as Promise<any>;

  async function session(daysFromNow: number, overrides: Partial<StoredAppointment> = {}) {
    const start = new Date(Date.now() + daysFromNow * DAY);
    return upsertAppointment({
      id: randomUUID(),
      therapistId: 'therapist-001',
      patientId: DEMO_PATIENT_ID,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 50 * 60_000),
      status: AppointmentStatus.CONCLUIDA,
      feeCents: 20000,
      paymentStatus: SessionPaymentStatus.PENDING,
      createdAt: new Date(start.getTime() - 7 * DAY),
      ...overrides
    });
  }

  it('o agendamento guarda o valor padrão do consultório ou o valor informado', async () => {
    const start = new Date(Date.now() + 20 * DAY);
    start.setUTCHours(17, 0, 0, 0);
    const slot = { patientId: DEMO_PATIENT_ID, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 50 * 60_000).toISOString() };

    const res = await app.request('/api/appointments', { method: 'POST', headers: headers(), body: JSON.stringify(slot) });
    const { appointment } = await res.json() as any;
    const practiceFee = await AppointmentService.practiceSessionFee('therapist-001');
    expect(practiceFee).toBeGreaterThan(0);
    expect(appointment.feeCents).toBe(practiceFee);
    expect(appointment.paymentStatus).toBe(SessionPaymentStatus.PENDING);

    const later = new Date(start.getTime() + 2 * DAY);
    const custom = await app.request('/api/appointments', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ ...slot, scheduledStart: later.toISOString(), scheduledEnd: new Date(later.getTime() + 50 * 60_000).toISOString(), feeCents: 12000 })
    });
    expect(((await custom.json()) as any).appointment.feeCents).toBe(12000);

    const invalid = await app.request('/api/appointments', { method: 'POST', headers: headers(), body: JSON.stringify({ ...slot, feeCents: -1 }) });
    expect(invalid.status).toBe(400);
  });

  it('contas a receber: sessões realizadas e faltas sem pagamento; isentas e futuras ficam de fora', async () => {
    const done = await session(-3);
    const noShow = await session(-2, { status: AppointmentStatus.NAO_COMPARECEU });
    const waived = await session(-4, { paymentStatus: SessionPaymentStatus.WAIVED });
    const upcoming = await session(3, { status: AppointmentStatus.CONFIRMADA });
    const canceled = await session(-1, { status: AppointmentStatus.CANCELADA_PELO_TERAPEUTA });
    const withoutFee = await session(-5, { feeCents: undefined });

    const data = await summary();
    const ids = data.receivable.map((i: any) => i.appointmentId);
    expect(ids).toEqual(expect.arrayContaining([done.id, noShow.id, withoutFee.id]));
    for (const id of [waived.id, upcoming.id, canceled.id]) expect(ids).not.toContain(id);
    expect(data.receivable.find((i: any) => i.appointmentId === done.id).patientName).toBe('Mariana Silva de Oliveira');
    expect(data.totals.receivableWithoutFee).toBeGreaterThanOrEqual(1);
  });

  it('baixa do pagamento entra no mês e sai das contas a receber; voltar a pendente limpa os dados', async () => {
    const done = await session(-3);
    const today = clinicToday();
    const res = await pay(done.id, { status: 'PAID', method: 'PIX', paidAt: today, feeCents: 18000 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).appointment).toMatchObject({ paymentStatus: 'PAID', paidAt: today, paymentMethod: 'PIX', feeCents: 18000 });

    let data = await summary(today.slice(0, 7));
    expect(data.receivable.map((i: any) => i.appointmentId)).not.toContain(done.id);
    expect(data.paid.map((i: any) => i.appointmentId)).toContain(done.id);
    expect(data.totals.paidCents).toBeGreaterThanOrEqual(18000);

    expect((await pay(done.id, { status: 'PENDING' })).status).toBe(200);
    const stored = await requireAppointment(done.id);
    expect(stored.paidAt).toBeUndefined();
    expect(stored.paymentMethod).toBeUndefined();
    data = await summary(today.slice(0, 7));
    expect(data.receivable.map((i: any) => i.appointmentId)).toContain(done.id);
  });

  it('pagador diferente do paciente: CPF validado e guardado cifrado', async () => {
    const done = await session(-3);
    expect((await pay(done.id, { status: 'PAID', method: 'CASH', payer: { name: 'Ana Silva', cpf: '123.456.789-00' } })).status).toBe(400);

    const res = await pay(done.id, { status: 'PAID', method: 'CASH', payer: { name: 'Ana Silva', cpf: '52998224725' } });
    expect(res.status).toBe(200);
    const stored = await requireAppointment(done.id);
    expect(JSON.stringify(stored.encryptedPayer)).not.toContain('52998224725');
    expect(JSON.stringify(stored.encryptedPayer)).not.toContain('529.982.247-25');
    const paid = (await summary()).paid.find((i: any) => i.appointmentId === done.id);
    expect(paid.payerName).toBe('Ana Silva');
  });

  it('recusa data futura, forma ausente, sessão cancelada e sessão sem valor', async () => {
    const done = await session(-3);
    const tomorrow = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
    expect((await pay(done.id, { status: 'PAID', method: 'PIX', paidAt: tomorrow })).status).toBe(400);
    expect((await pay(done.id, { status: 'PAID' })).status).toBe(400);
    expect((await pay(done.id, { status: 'PAID', method: 'PIX', paidAt: '2026-02-30' })).status).toBe(400);
    const canceled = await session(-1, { status: AppointmentStatus.CANCELADA_PELO_PACIENTE });
    expect((await pay(canceled.id, { status: 'PAID', method: 'PIX' })).status).toBe(400);
    const withoutFee = await session(-2, { feeCents: undefined });
    expect((await pay(withoutFee.id, { status: 'PAID', method: 'PIX' })).status).toBe(400);
    expect((await pay(withoutFee.id, { status: 'PAID', method: 'PIX', feeCents: 15000 })).status).toBe(200);
  });

  it('recepção registra pagamentos; supervisor e Admin não acessam o financeiro', async () => {
    const done = await session(-3);
    expect((await pay(done.id, { status: 'PAID', method: 'PIX' }, UserRole.RECEPCAO_SECRETARIA)).status).toBe(200);
    expect((await summary(undefined, UserRole.RECEPCAO_SECRETARIA)).success).toBe(true);
    for (const role of [UserRole.SUPERVISOR_CLINICO, UserRole.ADMIN]) {
      expect((await pay(done.id, { status: 'PENDING' }, role)).status).toBe(403);
      expect((await app.request('/api/finance/summary', { headers: headers(role) })).status).toBe(403);
    }
  });
});
