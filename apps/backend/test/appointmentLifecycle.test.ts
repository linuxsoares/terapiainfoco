import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { AppointmentService } from '../src/services/appointmentService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AppointmentStatus, UserRole } from '@terapiainfoco/shared';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

async function tokenFor(userId: string): Promise<string> {
  const { accessToken } = await authService.issueTokens(db.users.get(userId)!, '127.0.0.1');
  return accessToken;
}

async function appointmentStartingIn(minutes: number): Promise<string> {
  const therapistId = db.users.get(PSICOLOGA_ID)!.therapistId!;
  const start = new Date(Date.now() + minutes * 60 * 1000);
  const appt = await AppointmentService.createAppointment(therapistId, {
    patientId: DEMO_PATIENT_ID,
    scheduledStart: start.toISOString(),
    scheduledEnd: new Date(start.getTime() + 50 * 60 * 1000).toISOString(),
    bufferMinutes: 10
  }, { actorId: PSICOLOGA_ID, ipAddress: '127.0.0.1' });
  db.appointments.get(appt.id)!.status = AppointmentStatus.CONFIRMADA;
  return appt.id;
}

async function setStatus(userId: string, appointmentId: string, status: AppointmentStatus) {
  return app.request(`/api/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(userId)}` },
    body: JSON.stringify({ status })
  });
}

describe('Ciclo de vida da sessão na agenda', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('sessão de amanhã não pode ser iniciada, concluída nem marcada como falta', async () => {
    const id = await appointmentStartingIn(24 * 60);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.EM_ANDAMENTO)).status).toBe(400);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.CONCLUIDA)).status).toBe(400);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.NAO_COMPARECEU)).status).toBe(400);
    expect(db.appointments.get(id)!.status).toBe(AppointmentStatus.CONFIRMADA);
  });

  it('psicóloga inicia perto do horário e não conclui antes do início sem a sessão estar em andamento', async () => {
    const id = await appointmentStartingIn(10);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.CONCLUIDA)).status).toBe(400);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.EM_ANDAMENTO)).status).toBe(200);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.CONCLUIDA)).status).toBe(200);
    expect(db.appointments.get(id)!.status).toBe(AppointmentStatus.CONCLUIDA);
  });

  it('sessão passada pode ser concluída retroativamente', async () => {
    const id = await appointmentStartingIn(-3 * 24 * 60);
    expect((await setStatus(PSICOLOGA_ID, id, AppointmentStatus.CONCLUIDA)).status).toBe(200);
  });

  it('recepção não inicia sessão, mas pode cancelar', async () => {
    const recepcao = await authService.register(
      { name: 'Recepção', email: 'recepcao@consultorio.com.br', password: 'Senha@123456', role: UserRole.RECEPCAO_SECRETARIA },
      '127.0.0.1',
      { allowPrivilegedRole: true }
    );
    db.users.get(recepcao.id)!.therapistId = db.users.get(PSICOLOGA_ID)!.therapistId;

    const id = await appointmentStartingIn(10);
    expect((await setStatus(recepcao.id, id, AppointmentStatus.EM_ANDAMENTO)).status).toBe(400);
    expect((await setStatus(recepcao.id, id, AppointmentStatus.CANCELADA_PELO_TERAPEUTA)).status).toBe(200);
  });
});
