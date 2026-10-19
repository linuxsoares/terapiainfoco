import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000004';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

async function tokenFor(userId: string): Promise<string> {
  const { accessToken } = await authService.issueTokens(db.users.get(userId)!, '127.0.0.1');
  return accessToken;
}

function register(body: Record<string, unknown>) {
  return app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.88.1' },
    body: JSON.stringify(body)
  });
}

describe('Fronteiras de autenticação e perfis', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('requisições sem token não são mais executadas como a psicóloga padrão', async () => {
    expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}`)).status).toBe(401);
    expect((await app.request('/api/appointments/therapist/therapist-001')).status).toBe(401);
    const create = await app.request('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Intruso', email: 'x@x.com', phone: '1', consentTranscriptionSigned: true })
    });
    expect(create.status).toBe(401);
  });

  it('rotas públicas de agendamento continuam abertas', async () => {
    const res = await app.request('/api/appointments/available-slots?therapistId=therapist-001&date=2026-11-20');
    expect(res.status).toBe(200);
  });

  it('Admin/DPO não acessa agenda nem dados de pacientes', async () => {
    const token = await tokenFor(ADMIN_ID);
    const headers = { Authorization: `Bearer ${token}` };
    expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}`, { headers })).status).toBe(403);
    expect((await app.request('/api/appointments/therapist/therapist-001', { headers })).status).toBe(403);
  });

  it('psicóloga só consulta a agenda do próprio consultório', async () => {
    const headers = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}` };
    expect((await app.request('/api/appointments/therapist/therapist-001', { headers })).status).toBe(200);
    expect((await app.request('/api/appointments/therapist/outro-consultorio', { headers })).status).toBe(403);
  });

  it('paciente cadastrado pela psicóloga pertence ao consultório dela, ignorando therapistId do corpo', async () => {
    const res = await app.request('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}` },
      body: JSON.stringify({
        therapistId: 'consultorio-alheio',
        name: 'Paciente Escopo',
        email: 'escopo@paciente.com.br',
        phone: '11999990000',
        consentTranscriptionSigned: false
      })
    });
    expect(res.status).toBe(201);
    const { patient } = await res.json() as any;
    expect(db.patients.get(patient.id)!.therapistId).toBe('therapist-001');
  });

  for (const role of [UserRole.ADMIN, UserRole.SUPERVISOR_CLINICO, UserRole.RECEPCAO_SECRETARIA]) {
    it(`cadastro público recusa o perfil ${role}`, async () => {
      const res = await register({ name: 'Tentativa', email: `tentativa.${role.toLowerCase()}@x.com`, password: 'SenhaForte@2026', role });
      expect(res.status).toBe(400);
      expect(Array.from(db.users.values()).some((u) => u.email.startsWith('tentativa.'))).toBe(false);
    });
  }

  it('paciente que se cadastra não tem consentimento de transcrição presumido', async () => {
    const res = await register({
      name: 'Paciente Consentimento',
      email: 'consentimento@paciente.com.br',
      password: 'SenhaPaciente@2026',
      role: UserRole.PACIENTE
    });
    expect(res.status).toBe(201);
    const { user } = await res.json() as any;
    expect(db.patients.get(user.patientId)!.consentTranscriptionSigned).toBe(false);
  });
});
