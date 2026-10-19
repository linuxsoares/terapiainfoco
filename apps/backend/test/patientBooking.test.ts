import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';

async function tokenFor(userId: string): Promise<string> {
  const { accessToken } = await authService.issueTokens(db.users.get(userId)!, '127.0.0.1');
  return accessToken;
}

async function newPatient() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const user = await authService.register({
    name: `Paciente Agenda ${suffix}`,
    email: `agenda.${suffix}@paciente.com.br`,
    password: 'SenhaPaciente@2026',
    role: UserRole.PACIENTE,
    phone: '(11) 91234-5678'
  } as any);
  return { user, headers: { Authorization: `Bearer ${await tokenFor(user.id)}`, 'Content-Type': 'application/json' } };
}

/** Horário livre no futuro (dia útil distante para não colidir entre testes) */
function slot(daysAhead: number, hour: number) {
  const start = new Date(Date.UTC(2027, 0, 4 + daysAhead, hour, 0, 0));
  return { scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + 50 * 60000).toISOString() };
}

function book(headers: Record<string, string>, body: Record<string, unknown>) {
  return app.request('/api/appointments/patient/book', { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('Agendamento pelo paciente a partir do perfil público', () => {
  beforeEach(() => {
    globalRateLimitStore.reset();
  });

  it('cria o registro no consultório escolhido, vinculado à conta, sem consentimento presumido', async () => {
    const { user, headers } = await newPatient();
    const res = await book(headers, { therapistId: 'therapist-001', ...slot(0, 13), consentTeleconsultationSigned: true });
    expect(res.status).toBe(201);
    const { appointment } = await res.json() as any;
    expect(appointment.therapistName).toBe('Dra. Beatriz Santos');
    expect(appointment.meetUrl).toContain('meet.google.com');

    const record = db.patients.get(db.appointments.get(appointment.id)!.patientId)!;
    expect(record.therapistId).toBe('therapist-001');
    expect(record.linkedUserId).toBe(user.id);
    expect(record.consentTranscriptionSigned).toBe(false);
    expect(db.users.get(user.id)!.patientId).toBe(record.id);

    // Segunda consulta reaproveita o mesmo registro
    const again = await book(headers, { therapistId: 'therapist-001', ...slot(1, 13), consentTeleconsultationSigned: true });
    expect(again.status).toBe(201);
    const second = (await again.json() as any).appointment;
    expect(db.appointments.get(second.id)!.patientId).toBe(record.id);

    // O consultório passa a enxergar o paciente
    const staff = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}` };
    expect((await app.request(`/api/patients/${record.id}`, { headers: staff })).status).toBe(200);
  });

  it('"Minhas consultas" lista apenas as consultas do próprio paciente', async () => {
    const first = await newPatient();
    const other = await newPatient();
    await book(first.headers, { therapistId: 'therapist-001', ...slot(2, 14), consentTeleconsultationSigned: true });
    await book(other.headers, { therapistId: 'therapist-001', ...slot(2, 16), consentTeleconsultationSigned: true });

    const res = await app.request('/api/appointments/patient/mine', { headers: first.headers });
    expect(res.status).toBe(200);
    const { appointments } = await res.json() as any;
    expect(appointments).toHaveLength(1);
    expect(appointments[0].scheduledStart).toBe(slot(2, 14).scheduledStart);
    expect(appointments[0].therapistName).toBe('Dra. Beatriz Santos');
  });

  it('exige TCLE, psicólogo verificado e perfil de paciente', async () => {
    const { headers } = await newPatient();
    expect((await book(headers, { therapistId: 'therapist-001', ...slot(3, 13), consentTeleconsultationSigned: false })).status).toBe(400);
    const unverified = await book(headers, { therapistId: 'consultorio-inexistente', ...slot(3, 14), consentTeleconsultationSigned: true });
    expect(unverified.status).toBe(400);
    expect((await unverified.json() as any).error).toContain('indisponível');

    const staff = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}`, 'Content-Type': 'application/json' };
    expect((await book(staff, { therapistId: 'therapist-001', ...slot(3, 15), consentTeleconsultationSigned: true })).status).toBe(403);
    expect((await app.request('/api/appointments/patient/mine')).status).toBe(401);
  });

  it('agendamento público anônimo também exige psicólogo verificado', async () => {
    const res = await app.request('/api/appointments/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'consultorio-inexistente',
        patientName: 'Anônimo',
        patientEmail: 'anonimo@x.com',
        patientPhone: '11999999999',
        ...slot(4, 13),
        consentTeleconsultationSigned: true
      })
    });
    expect(res.status).toBe(400);
  });
});
