import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { setEmailSenderForTests, type EmailMessage } from '../src/services/email/emailSender';
import { encryptField } from '../src/services/cryptoContext';
import { createAppointmentLinkToken, sendDueAppointmentReminders } from '../src/services/appointmentReminderService';
import { AppointmentStatus, ReminderDeliveryStatus, type StoredAppointment } from '@terapiainfoco/shared';
import { resetDb, seedDemoSession, upsertAppointment, requireAppointment, updatePatient } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const HOUR = 60 * 60 * 1000;

describe('Lembretes de consulta por e-mail com confirmar/cancelar', () => {
  let outbox: EmailMessage[];

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    outbox = [];
    setEmailSenderForTests({ name: 'test', send: async (m) => { outbox.push(m); } });
  });

  afterEach(() => setEmailSenderForTests(undefined));

  /** Consulta confirmada que começa daqui a `hoursAhead`, marcada há `bookedHoursAgo` */
  async function appointmentIn(hoursAhead: number, overrides: Partial<StoredAppointment> = {}, bookedHoursAgo = 24 * 7) {
    const start = new Date(Date.now() + hoursAhead * HOUR);
    return upsertAppointment({
      id: randomUUID(),
      therapistId: 'therapist-001',
      patientId: DEMO_PATIENT_ID,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 50 * 60_000),
      status: AppointmentStatus.CONFIRMADA,
      createdAt: new Date(Date.now() - bookedHoursAgo * HOUR),
      ...overrides
    });
  }

  const remindersFor = (id: string) => outbox.filter((m) => m.subject.startsWith('Lembrete') && m.text.includes(`sala=${id}`));
  const manageToken = (mail: EmailMessage) => decodeURIComponent(/consulta=([^\s"&]+)/.exec(mail.text)![1]);
  const linkRequest = (action: '' | '/confirm' | '/cancel', token: string) =>
    app.request(`/api/appointments/link${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
    });

  it('envia uma única vez para a consulta que entra na janela de 48h', async () => {
    const appointment = await appointmentIn(30);
    await sendDueAppointmentReminders();
    await sendDueAppointmentReminders();

    const mails = remindersFor(appointment.id);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('mariana.silva@email.com');
    expect(mails[0].text).toContain('horário de Brasília');
    expect(mails[0].text).toContain('?consulta=');
    const stored = await requireAppointment(appointment.id);
    expect(stored.reminderStatus).toBe(ReminderDeliveryStatus.SENT);
    expect(stored.lastReminderSentAt).toBeDefined();
  });

  it('ignora consultas fora da janela, canceladas ou marcadas já dentro dela', async () => {
    const far = await appointmentIn(72);
    const canceled = await appointmentIn(30, { status: AppointmentStatus.CANCELADA_PELO_TERAPEUTA });
    const justBooked = await appointmentIn(30, {}, 1);
    const past = await appointmentIn(-2);
    await sendDueAppointmentReminders();
    for (const a of [far, canceled, justBooked, past]) expect(remindersFor(a.id)).toHaveLength(0);
  });

  it('paciente sem e-mail: lembrete fica como FAILED, sem novas tentativas', async () => {
    await updatePatient(DEMO_PATIENT_ID, { encryptedEmail: encryptField('') });
    const appointment = await appointmentIn(30);
    expect(await sendDueAppointmentReminders()).toEqual({ sent: 0, failed: 1 });
    expect((await requireAppointment(appointment.id)).reminderStatus).toBe(ReminderDeliveryStatus.FAILED);
    expect(await sendDueAppointmentReminders()).toEqual({ sent: 0, failed: 0 });
  });

  it('o link mostra a sessão e confirma a presença (idempotente)', async () => {
    const appointment = await appointmentIn(30);
    await sendDueAppointmentReminders();
    const token = manageToken(remindersFor(appointment.id)[0]);

    const view = await (await linkRequest('', token)).json() as any;
    expect(view.appointment).toMatchObject({ therapistName: 'Dra. Beatriz Santos', canConfirm: true, canCancel: true, patientConfirmed: false });
    expect(view.appointment.patientName).toBeUndefined();

    for (let i = 0; i < 2; i++) {
      const res = await linkRequest('/confirm', token);
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).appointment).toMatchObject({ patientConfirmed: true, canConfirm: false });
    }
    expect((await requireAppointment(appointment.id)).patientConfirmedAt).toBeDefined();
  });

  it('cancelar pelo link libera o horário e avisa o psicólogo', async () => {
    const appointment = await appointmentIn(30);
    const token = createAppointmentLinkToken(appointment);
    const res = await linkRequest('/cancel', token);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).appointment).toMatchObject({ status: AppointmentStatus.CANCELADA_PELO_PACIENTE, canCancel: false });
    expect((await requireAppointment(appointment.id)).status).toBe(AppointmentStatus.CANCELADA_PELO_PACIENTE);

    const notice = outbox.find((m) => m.to === 'psicologo@terapiainfoco.com.br');
    expect(notice?.subject).toContain('Sessão cancelada');
  });

  it('com menos de 24h o cancelamento online é recusado; abrir o link nunca cancela', async () => {
    const appointment = await appointmentIn(10);
    const token = createAppointmentLinkToken(appointment);

    const view = await (await linkRequest('', token)).json() as any;
    expect(view.appointment).toMatchObject({ canCancel: false, canConfirm: true });

    const res = await linkRequest('/cancel', token);
    expect(res.status).toBe(409);
    expect((await requireAppointment(appointment.id)).status).toBe(AppointmentStatus.CONFIRMADA);
  });

  it('link adulterado, de outra consulta ou vencido não funciona', async () => {
    const appointment = await appointmentIn(30);
    const other = await appointmentIn(40);
    const [, expires, signature] = createAppointmentLinkToken(appointment).split('.');
    const finished = await appointmentIn(-3);

    const tokens = [
      `${other.id}.${expires}.${signature}`,
      `${appointment.id}.${Number(expires) + 3600}.${signature}`,
      createAppointmentLinkToken(finished),
      'qualquer-coisa',
      ''
    ];
    for (const token of tokens) {
      const res = await linkRequest('/cancel', token);
      expect(res.status).toBe(404);
    }
    expect((await requireAppointment(other.id)).status).toBe(AppointmentStatus.CONFIRMADA);
  });
});
