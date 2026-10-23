import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { setEmailSenderForTests, type EmailMessage } from '../src/services/email/emailSender';
import { encryptField } from '../src/services/cryptoContext';
import { resetDb, requireUser, seedDemoSession, upsertPatient, requirePatient } from './helpers/db';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

describe('E-mail de agendamento ao paciente', () => {
  let outbox: EmailMessage[];
  let headers: Record<string, string>;

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    outbox = [];
    setEmailSenderForTests({ name: 'test', send: async (m) => { outbox.push(m); } });
    const { accessToken } = await authService.issueTokens(await requireUser(PSICOLOGA_ID), '127.0.0.1');
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
  });

  afterEach(() => setEmailSenderForTests(undefined));

  // Daqui a N dias, 14h no horário de Brasília (17h UTC)
  const futureSlot = (offsetDays = 20) => {
    const start = new Date(Date.now() + offsetDays * 86_400_000);
    start.setUTCHours(17, 0, 0, 0);
    return { scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 50 * 60_000).toISOString() };
  };

  it('consulta avulsa: e-mail com psicólogo, horário de Brasília e link da sala', async () => {
    const res = await app.request('/api/appointments', {
      method: 'POST', headers, body: JSON.stringify({ patientId: DEMO_PATIENT_ID, ...futureSlot() })
    });
    expect(res.status).toBe(201);
    const { appointment } = await res.json() as any;

    expect(outbox).toHaveLength(1);
    const mail = outbox[0];
    expect(mail.to).toBe('mariana.silva@email.com');
    expect(mail.subject).toContain('Sessão agendada com');
    expect(mail.text).toContain('14:00');
    expect(mail.text).toContain('horário de Brasília');
    expect(mail.text).toContain(`sala=${appointment.id}`);
    // Nada clínico no e-mail
    expect(mail.text).not.toMatch(/CPF|123\.456/);
  });

  it('série recorrente: um único e-mail listando as sessões', async () => {
    const res = await app.request('/api/appointments/recurrent', {
      method: 'POST', headers,
      body: JSON.stringify({ patientId: DEMO_PATIENT_ID, ...futureSlot(30), recurrence: { frequency: 'WEEKLY', count: 4 } })
    });
    expect(res.status).toBe(201);
    const result = await res.json() as any;
    expect(result.createdAppointments.length).toBe(4);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toContain('Sessões agendadas');
    for (const a of result.createdAppointments) expect(outbox[0].text).toContain(`sala=${a.id}`);
  });

  it('paciente sem e-mail válido: agenda normalmente, sem envio', async () => {
    await upsertPatient({ ...(await requirePatient(DEMO_PATIENT_ID)), encryptedEmail: encryptField('') });
    const res = await app.request('/api/appointments', {
      method: 'POST', headers, body: JSON.stringify({ patientId: DEMO_PATIENT_ID, ...futureSlot(40) })
    });
    expect(res.status).toBe(201);
    expect(outbox).toHaveLength(0);
  });

  it('falha do provedor não derruba o agendamento', async () => {
    setEmailSenderForTests({ name: 'falho', send: async () => { throw new Error('HTTP 500'); } });
    const res = await app.request('/api/appointments', {
      method: 'POST', headers, body: JSON.stringify({ patientId: DEMO_PATIENT_ID, ...futureSlot(50) })
    });
    expect(res.status).toBe(201);
  });
});
