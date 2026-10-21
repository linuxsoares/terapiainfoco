import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';
import { resetDb, requireUser } from './helpers/db';

const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

async function newPsychologist() {
  const user = await authService.register({
    name: 'Dra. Consultório Real',
    email: `real.${crypto.randomUUID()}@psi.com.br`,
    password: 'SenhaPsicologo@2026',
    role: UserRole.PSICOLOGO_TITULAR,
    crp: '06/222222'
  } as any);
  const { accessToken } = await authService.issueTokens((await requireUser(user.id)), '127.0.0.1');
  return { user: (await requireUser(user.id)), headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } };
}

async function post(path: string, headers: Record<string, string>, body: unknown) {
  const res = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}

describe('Dashboard do psicólogo usa o próprio consultório', () => {
  beforeEach(async () => {
    await resetDb();
    db.seedDemoSession();
    await globalRateLimitStore.reset();
  });

  it('contabiliza pacientes, sessões e prontuário SOAP por IA do consultório do usuário logado', async () => {
    const { headers } = await newPsychologist();

    const empty = await app.request('/api/analytics/clinical-overview?therapistId=therapist-001', { headers });
    expect(empty.status).toBe(200);
    const emptyBody = await empty.json() as any;
    // therapistId da URL é ignorado: nada do consultório demo vaza
    expect(emptyBody.totalPatients).toBe(0);
    expect(emptyBody.sessionsByMonth).toHaveLength(6);

    const patient = (await post('/api/patients', headers, {
      name: 'Paciente Real', email: 'paciente.real@exemplo.com', phone: '11988887777', consentTranscriptionSigned: true
    })).body.patient;
    const start = new Date(Date.now() + 7 * 86_400_000);
    start.setUTCHours(13, 0, 0, 0);
    const appointment = (await post('/api/appointments', headers, {
      patientId: patient.id,
      scheduledStart: start.toISOString(),
      scheduledEnd: new Date(start.getTime() + 50 * 60_000).toISOString()
    })).body.appointment;
    expect(appointment?.id).toBeDefined();

    const ingest = await post('/api/transcription/ingest', headers, {
      appointmentId: appointment.id,
      patientId: patient.id,
      consentConfirmed: true,
      rawTranscriptText: 'PACIENTE: Tenho sentido muita ansiedade.\nTERAPEUTA: Vamos fazer um registro diário.'
    });
    expect(ingest.status).toBe(201);
    const review = await post('/api/transcription/draft/review', headers, {
      draftId: ingest.body.soapDraft.id,
      status: 'ACCEPTED_BY_THERAPIST',
      saveAsOfficialEhrNote: true
    });
    expect(review.status).toBe(200);

    // O prontuário criado pela IA abre pela rota padrão de prontuários
    const record = await app.request(`/api/clinical-records/${review.body.createdEhrRecordId}`, { headers });
    expect(record.status).toBe(200);
    expect((await record.json() as any).record.soap.subjective).toContain('ansiedade');

    const overview = await (await app.request('/api/analytics/clinical-overview', { headers })).json() as any;
    expect(overview.totalPatients).toBe(1);
    expect(overview.totalSessions).toBe(1);
    expect(overview.totalSoapRecords).toBe(1);
    expect(overview.signedSoapRecords).toBe(1);
    expect(overview.recentSessions[0].patientName).toBe('Paciente Real');
  });

  it('métricas individuais e de segurança respeitam o consultório', async () => {
    const { headers } = await newPsychologist();
    expect((await app.request(`/api/analytics/patient/${DEMO_PATIENT_ID}`, { headers })).status).toBe(404);

    const security = await (await app.request('/api/analytics/security-metrics', { headers })).json() as any;
    expect(security.wormIntegrityStatus).toBe('INTACT');
    // Eventos do consultório demo não entram nas métricas do novo consultório
    const demoDecrypts = db.auditLogs.filter((l) => l.action === 'DECRYPT_READ').length;
    expect(security.totalDecryptReads).toBeLessThanOrEqual(demoDecrypts);
    expect(security.recentSecurityAlerts.every((a: any) => a.actorId !== '00000000-0000-0000-0000-000000000001')).toBe(true);
  });
});
