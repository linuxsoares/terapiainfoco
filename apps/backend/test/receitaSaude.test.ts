import { describe, it, expect, beforeEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { app } from '../src/index';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { encryptField } from '../src/services/cryptoContext';
import { clinicToday } from '../src/services/sessionPaymentService';
import { AppointmentStatus, SessionPaymentStatus, UserRole, type StoredAppointment } from '@terapiainfoco/shared';
import { resetDb, seedDemoSession, listUsers, upsertAppointment, updatePatient, requireAppointment } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';
const DAY = 86_400_000;

describe('Relatório para o Receita Saúde', () => {
  const tokens = new Map<UserRole, string>();
  const month = clinicToday().slice(0, 7);
  const today = clinicToday();

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    await updatePatient(DEMO_PATIENT_ID, { encryptedCpf: encryptField('52998224725') });
    const users = await listUsers();
    for (const role of [UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.SUPERVISOR_CLINICO]) {
      tokens.set(role, (await authService.issueTokens(users.find((u) => u.role === role)!, '127.0.0.1')).accessToken);
    }
  });

  const headers = (role = UserRole.PSICOLOGO_TITULAR) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(role)}` });
  const report = async (role?: UserRole) => (await app.request(`/api/finance/receita-saude?month=${month}`, { headers: headers(role) })).json() as Promise<any>;
  const pay = (id: string, body: unknown) =>
    app.request(`/api/appointments/${id}/payment`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
  const mark = (id: string, issued: boolean) =>
    app.request(`/api/appointments/${id}/receita-saude`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ issued }) });

  async function doneSession(overrides: Partial<StoredAppointment> = {}) {
    const start = new Date(Date.now() - 2 * DAY);
    return upsertAppointment({
      id: randomUUID(),
      therapistId: 'therapist-001',
      patientId: DEMO_PATIENT_ID,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 50 * 60_000),
      status: AppointmentStatus.CONCLUIDA,
      feeCents: 25000,
      paymentStatus: SessionPaymentStatus.PENDING,
      createdAt: new Date(start.getTime() - 7 * DAY),
      ...overrides
    });
  }

  it('traz os campos do recibo: pagador = paciente por padrão, valor, data e descrição', async () => {
    const session = await doneSession();
    await pay(session.id, { status: 'PAID', method: 'PIX', paidAt: today });

    const data = await report();
    const item = data.items.find((i: any) => i.appointmentId === session.id);
    expect(item).toMatchObject({
      paidAt: today,
      amountCents: 25000,
      payerName: 'Mariana Silva de Oliveira',
      payerCpf: '529.982.247-25',
      beneficiaryName: 'Mariana Silva de Oliveira',
      beneficiaryCpf: '529.982.247-25',
      issued: false
    });
    expect(item.description).toContain('Atendimento psicológico');
    expect(data.totalCents).toBeGreaterThanOrEqual(25000);
  });

  it('responsável como pagador e CPF ausente do paciente sinalizado', async () => {
    await updatePatient(DEMO_PATIENT_ID, { encryptedCpf: encryptField('') });
    const session = await doneSession();
    await pay(session.id, { status: 'PAID', method: 'CASH', payer: { name: 'Ana Responsável', cpf: '111.444.777-35' } });

    const data = await report();
    const item = data.items.find((i: any) => i.appointmentId === session.id);
    expect(item).toMatchObject({ payerName: 'Ana Responsável', payerCpf: '111.444.777-35', beneficiaryCpf: null });
    expect(data.missingCpf).toBeGreaterThanOrEqual(1);
  });

  it('marcar como lançado só vale para sessão paga e é limpo ao desfazer o pagamento', async () => {
    const pending = await doneSession();
    expect((await mark(pending.id, true)).status).toBe(400);

    await pay(pending.id, { status: 'PAID', method: 'PIX' });
    expect((await mark(pending.id, true)).status).toBe(200);
    expect((await report()).items.find((i: any) => i.appointmentId === pending.id).issued).toBe(true);

    await pay(pending.id, { status: 'PENDING' });
    expect((await requireAppointment(pending.id)).receitaSaudeIssuedAt).toBeUndefined();
  });

  it('supervisor não acessa o relatório; recepção acessa', async () => {
    expect((await app.request(`/api/finance/receita-saude?month=${month}`, { headers: headers(UserRole.SUPERVISOR_CLINICO) })).status).toBe(403);
    expect((await report(UserRole.RECEPCAO_SECRETARIA)).success).toBe(true);
  });
});
