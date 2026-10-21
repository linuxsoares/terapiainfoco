import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole, ReceiptPurpose, BillingModality, PaymentMethod } from '@terapiainfoco/shared';
import { hashCpf } from '../src/services/cryptoContext';
import { resetDb, requireUser, listUsers } from './helpers/db';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000004';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

async function tokenFor(userId: string): Promise<string> {
  const { accessToken } = await authService.issueTokens((await requireUser(userId)), '127.0.0.1');
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
  beforeEach(async () => {
    await resetDb();
    db.seedDemoSession();
    await globalRateLimitStore.reset();
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

  it('configuração pública informa o modo demonstração ao frontend', async () => {
    const res = await app.request('/api/auth/public-config');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, demoMode: true });
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
      expect((await listUsers()).some((u) => u.email.startsWith('tentativa.'))).toBe(false);
    });
  }

  it('cadastro de paciente não cria prontuário nem aceita vínculo a patientId alheio', async () => {
    const res = await register({
      name: 'Paciente Oportunista',
      email: 'oportunista@paciente.com.br',
      password: 'SenhaPaciente@2026',
      role: UserRole.PACIENTE,
      patientId: DEMO_PATIENT_ID
    });
    expect(res.status).toBe(201);
    const { user } = await res.json() as any;
    expect(user.patientId).toBeUndefined();
    const headers = { Authorization: `Bearer ${await tokenFor(user.id)}` };
    expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}`, { headers })).status).toBe(403);
  });

  describe('posse entre consultórios', () => {
    const DEMO_APPOINTMENT_ID = '00000000-0000-0000-0000-000000000010';

    async function otherPsychologistHeaders() {
      const other = await authService.register({
        name: 'Dra. Outro Consultório',
        email: `outro.${crypto.randomUUID()}@psi.com.br`,
        password: 'SenhaPsicologo@2026',
        role: UserRole.PSICOLOGO_TITULAR,
        crp: '06/111111'
      } as any);
      return { Authorization: `Bearer ${await tokenFor(other.id)}`, 'Content-Type': 'application/json' };
    }

    async function demoClinicalRecordId(): Promise<string> {
      const res = await app.request('/api/clinical-records/draft', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: DEMO_APPOINTMENT_ID,
          patientId: DEMO_PATIENT_ID,
          sessionNumber: 1,
          soap: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' }
        })
      });
      expect(res.status).toBe(201);
      return (await res.json() as any).record.id;
    }

    it('psicólogo de outro consultório não enxerga paciente, consulta nem prontuário alheios', async () => {
      const recordId = await demoClinicalRecordId();
      const headers = await otherPsychologistHeaders();

      expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}`, { headers })).status).toBe(404);
      expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}/timeline`, { headers })).status).toBe(404);
      expect((await app.request(`/api/clinical-records/${recordId}`, { headers })).status).toBe(404);
      const status = await app.request(`/api/appointments/${DEMO_APPOINTMENT_ID}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'CANCELADA_PELO_TERAPEUTA' })
      });
      expect(status.status).toBe(404);
      const booking = await app.request('/api/appointments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: DEMO_PATIENT_ID,
          scheduledStart: '2026-12-01T10:00:00.000Z',
          scheduledEnd: '2026-12-01T10:50:00.000Z'
        })
      });
      expect(booking.status).toBe(404);
      const draft = await app.request('/api/clinical-records/draft', {
        method: 'POST',
        headers,
        body: JSON.stringify({ appointmentId: DEMO_APPOINTMENT_ID, patientId: DEMO_PATIENT_ID, sessionNumber: 2, soap: {} })
      });
      expect(draft.status).toBe(404);
    });

    it('busca por CPF fica restrita ao consultório', async () => {
      const headers = await otherPsychologistHeaders();
      db.patients.get(DEMO_PATIENT_ID)!.cpfBindex = hashCpf('123.456.789-00');
      const own = await app.request('/api/patients/search/cpf?cpf=123.456.789-00', {
        headers: { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}` }
      });
      expect(own.status).toBe(200);
      expect((await app.request('/api/patients/search/cpf?cpf=123.456.789-00', { headers })).status).toBe(404);
    });

    it('Admin/DPO não lê prontuário, mas atende direitos do titular (revogação de consentimento)', async () => {
      const recordId = await demoClinicalRecordId();
      const headers = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}`, 'Content-Type': 'application/json' };
      expect((await app.request(`/api/clinical-records/${recordId}`, { headers })).status).toBe(403);
      expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}/timeline`, { headers })).status).toBe(403);
      const revoke = await app.request(`/api/patients/${DEMO_PATIENT_ID}/revoke-consent`, {
        method: 'POST', headers, body: JSON.stringify({ reason: 'Solicitação do titular via canal do DPO' })
      });
      expect(revoke.status).toBe(200);
    });

    it('módulos clínicos (documentos, metas, escalas, marcadores, transcrição) respeitam a posse', async () => {
      const ownHeaders = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}`, 'Content-Type': 'application/json' };
      const docRes = await app.request('/api/documents/draft', {
        method: 'POST',
        headers: ownHeaders,
        body: JSON.stringify({ patientId: DEMO_PATIENT_ID, type: 'DECLARACAO', title: 'Declaração', content: 'Compareceu.' })
      });
      expect(docRes.status).toBe(201);
      const documentId = (await docRes.json() as any).document.id;
      expect((await app.request(`/api/documents/${documentId}`, { headers: ownHeaders })).status).toBe(200);

      const headers = await otherPsychologistHeaders();
      const forbiddenReads = [
        `/api/documents/${documentId}`,
        `/api/goals/patient/${DEMO_PATIENT_ID}`,
        `/api/psychometrics/patient/${DEMO_PATIENT_ID}`,
        `/api/clinical-markers/appointment/${DEMO_APPOINTMENT_ID}`,
        `/api/transcription/session/${DEMO_APPOINTMENT_ID}`,
        `/api/transcriptions/appointment/${DEMO_APPOINTMENT_ID}`
      ];
      for (const path of forbiddenReads) {
        expect({ path, status: (await app.request(path, { headers })).status }).toEqual({ path, status: 404 });
      }
      const goal = await app.request('/api/goals', {
        method: 'POST', headers, body: JSON.stringify({ patientId: DEMO_PATIENT_ID, title: 'Meta alheia' })
      });
      expect(goal.status).toBe(404);

      const adminHeaders = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}` };
      expect((await app.request(`/api/goals/patient/${DEMO_PATIENT_ID}`, { headers: adminHeaders })).status).toBe(403);
      expect((await app.request(`/api/documents/${documentId}`, { headers: adminHeaders })).status).toBe(403);
    });

    it('encaminhamentos, laudos, recibos, árvore diagnóstica, encaminhamento psiquiátrico e cofre respeitam a posse', async () => {
      const ownHeaders = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}`, 'Content-Type': 'application/json' };
      const receiptRes = await app.request('/api/billing/receipts', {
        method: 'POST',
        headers: ownHeaders,
        body: JSON.stringify({
          patientId: DEMO_PATIENT_ID,
          purpose: ReceiptPurpose.CONVENIO_REIMBURSO,
          modality: BillingModality.PER_SESSION,
          sessionsCovered: [{ data: '2026-02-12', horario: '15:00', modalidade: 'ONLINE' }],
          amountCents: 28000,
          paymentMethod: PaymentMethod.PIX
        })
      });
      expect(receiptRes.status).toBe(201);
      const receiptId = (await receiptRes.json() as any).receipt.id;

      const headers = await otherPsychologistHeaders();
      const forbiddenReads = [
        `/api/referrals/patient/${DEMO_PATIENT_ID}`,
        `/api/reports/consolidated/patient/${DEMO_PATIENT_ID}`,
        `/api/billing/receipts?patientId=${DEMO_PATIENT_ID}`,
        `/api/diagnostic-tree/patients/${DEMO_PATIENT_ID}/assessments`,
        `/api/psychiatric-referrals/patients/${DEMO_PATIENT_ID}`,
        `/api/portability-vault/patients/${DEMO_PATIENT_ID}/history`,
        `/api/consent/patient/${DEMO_PATIENT_ID}`
      ];
      for (const path of forbiddenReads) {
        expect({ path, status: (await app.request(path, { headers })).status }).toEqual({ path, status: 404 });
      }
      // Listagem sem filtro mostra apenas recibos do próprio consultório
      const otherList = await (await app.request('/api/billing/receipts', { headers })).json() as any;
      expect(otherList.receipts.map((r: any) => r.id)).not.toContain(receiptId);
      const cancel = await app.request('/api/billing/receipts/cancel', {
        method: 'POST', headers, body: JSON.stringify({ receiptId, cancelReason: 'Tentativa alheia' })
      });
      expect(cancel.status).toBe(404);

      // Admin não lê conteúdo clínico; paciente não usa ferramentas clínicas
      const adminHeaders = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}` };
      expect((await app.request(`/api/referrals/patient/${DEMO_PATIENT_ID}`, { headers: adminHeaders })).status).toBe(403);
      expect((await app.request(`/api/billing/receipts`, { headers: adminHeaders })).status).toBe(403);
    });

    it('paciente acessa o próprio cofre e consentimento, mas não os de outro paciente', async () => {
      const demoPatientUser = (await listUsers()).find((u) => u.role === UserRole.PACIENTE)!;
      const headers = { Authorization: `Bearer ${await tokenFor(demoPatientUser.id)}` };
      expect((await app.request(`/api/portability-vault/patients/${demoPatientUser.patientId}/history`, { headers })).status).toBe(200);

      const intruder = await register({ name: 'Outro Paciente', email: `intruso.${crypto.randomUUID().slice(0, 6)}@x.com`, password: 'SenhaPaciente@2026', role: UserRole.PACIENTE });
      const intruderId = (await intruder.json() as any).user.id;
      const intruderHeaders = { Authorization: `Bearer ${await tokenFor(intruderId)}` };
      expect((await app.request(`/api/portability-vault/patients/${DEMO_PATIENT_ID}/history`, { headers: intruderHeaders })).status).toBe(404);
      expect((await app.request(`/api/consent/patient/${DEMO_PATIENT_ID}`, { headers: intruderHeaders })).status).toBe(404);
      expect((await app.request('/api/diagnostic-tree/definition', { headers: intruderHeaders })).status).toBe(403);
    });

    it('trilha de auditoria do psicólogo mostra só o próprio consultório; governança é do DPO', async () => {
      // Leitura de paciente do consultório demo gera registro na trilha
      const own = { Authorization: `Bearer ${await tokenFor(PSICOLOGA_ID)}` };
      expect((await app.request(`/api/patients/${DEMO_PATIENT_ID}`, { headers: own })).status).toBe(200);
      const ownLogs = await (await app.request('/api/audit', { headers: own })).json() as any;
      expect(ownLogs.logs.some((l: any) => l.resourceId === DEMO_PATIENT_ID)).toBe(true);

      const headers = await otherPsychologistHeaders();
      const otherLogs = await (await app.request('/api/audit', { headers })).json() as any;
      expect(otherLogs.logs.some((l: any) => l.resourceId === DEMO_PATIENT_ID || l.actorId === PSICOLOGA_ID)).toBe(false);
      const byResource = await (await app.request(`/api/audit/resource/${DEMO_PATIENT_ID}`, { headers })).json() as any;
      expect(byResource.count).toBe(0);
      expect((await app.request('/api/audit/governance/overview', { headers })).status).toBe(403);

      const admin = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}` };
      const adminLogs = await (await app.request('/api/audit', { headers: admin })).json() as any;
      expect(adminLogs.logs.some((l: any) => l.resourceId === DEMO_PATIENT_ID)).toBe(true);
    });
  });
});
