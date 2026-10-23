import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AppointmentStatus, DocumentType, UserRole } from '@terapiainfoco/shared';
import { resetDb, listUsers } from './helpers/db';
import { authService } from '../src/services/authService';

describe('Analytics, Métricas Clínicas & Observabilidade (Opção E - RFC-001)', () => {
  let psychologistToken = '';
  let secretaryToken = '';

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();

    // 1. Login como Psicóloga Titular
    const psychoRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const psychoData = await psychoRes.json();
    psychologistToken = psychoData.accessToken;

    // 2. Login como Secretária / Recepção
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const secData = await secRes.json();
    secretaryToken = secData.accessToken;
  });

  async function seedClinicalData() {
    // 1. Cadastra paciente Mariana
    const patRes = await app.request('/api/patients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Mariana Silva de Oliveira',
        email: 'mariana.silva@email.com',
        phone: '11987654321',
        cpf: '123.456.789-00',
        consentTranscriptionSigned: true
      })
    });
    const patData = await patRes.json();
    const patientId = patData.patient.id;

    // 2. Cria 2 agendamentos: 1 concluído e 1 confirmado
    const appt1Res = await app.request('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId,
        scheduledStart: new Date(Date.now() - 7 * 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() - 7 * 86400000 + 3000000).toISOString()
      })
    });
    const appt1Data = await appt1Res.json();
    const appt1Id = appt1Data.appointment.id;

    // Marca o primeiro como COMPLETED
    await app.request(`/api/appointments/${appt1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({ status: AppointmentStatus.CONCLUIDA })
    });

    const appt2Res = await app.request('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId,
        scheduledStart: new Date(Date.now() + 86400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 86400000 + 3000000).toISOString()
      })
    });
    const appt2Data = await appt2Res.json();
    const appt2Id = appt2Data.appointment.id;

    // 3. Cria prontuário SOAP assinado para a sessão 1
    const soapDraftRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        appointmentId: appt1Id,
        patientId,
        sessionNumber: 1,
        soap: {
          subjective: 'Paciente relata melhora na ansiedade ao longo da semana.',
          objective: 'Afeto modulado, contato visual adequado e discurso fluente.',
          assessment: 'Boa evolução nas técnicas cognitivas comportamentais.',
          plan: 'Manter registro diário de pensamentos automáticos.'
        }
      })
    });
    const soapDraft = await soapDraftRes.json();

    await app.request('/api/clinical-records/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        recordId: soapDraft.record.id,
        confirmedHumanReview: true
      })
    });

    // 4. Cria documento oficial do CFP (Atestado)
    await app.request('/api/documents/draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${psychologistToken}`
      },
      body: JSON.stringify({
        patientId,
        therapistId: 'therapist-001',
        type: DocumentType.ATESTADO,
        title: 'Atestado Psicológico Clínico',
        content: 'Atesto acompanhamento psicológico regular.'
      })
    });

    // 5. Realiza busca decifrada por CPF para acionar DECRYPT_READ audit
    await app.request('/api/patients/search/cpf?cpf=123.456.789-00', {
      headers: { Authorization: `Bearer ${psychologistToken}` }
    });

    return { patientId, appt1Id, appt2Id };
  }

  it('GET /api/analytics/clinical-overview deve consolidar KPIs clínicos com precisão', async () => {
    const { patientId } = await seedClinicalData();

    const res = await app.request('/api/analytics/clinical-overview', {
      headers: { Authorization: `Bearer ${psychologistToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.totalPatients).toBeGreaterThanOrEqual(1);
    expect(body.activePatients).toBeGreaterThanOrEqual(1);
    expect(body.quarantinedPatients).toBe(0);

    expect(body.totalSessions).toBeGreaterThanOrEqual(2);
    expect(body.completedSessions).toBeGreaterThanOrEqual(1);
    expect(body.attendanceRate).toBeGreaterThanOrEqual(50);

    expect(body.totalSoapRecords).toBeGreaterThanOrEqual(1);
    expect(body.signedSoapRecords).toBeGreaterThanOrEqual(1);
    expect(body.humanReviewComplianceRate).toBe(100);

    expect(body.totalDocuments).toBeGreaterThanOrEqual(1);
    expect(body.documentsByType[DocumentType.ATESTADO]).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(body.recentSessions)).toBe(true);
    expect(body.recentSessions.length).toBeGreaterThan(0);
    expect(body.recentSessions[0].patientName).toContain('Mariana');
  });

  it('GET /api/analytics/security-metrics deve atestar integridade da trilha WORM e observabilidade', async () => {
    await seedClinicalData();

    const res = await app.request('/api/analytics/security-metrics', {
      headers: { Authorization: `Bearer ${psychologistToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.totalAuditLogs).toBeGreaterThan(0);
    expect(body.wormIntegrityStatus).toBe('INTACT');
    expect(body.totalDecryptReads).toBeGreaterThan(0);
    expect(body.totalSignatures).toBeGreaterThan(0);
    expect(body.twoFactorAdoptionRate).toBeDefined();

    expect(body.auditEventsByAction).toBeDefined();
    expect(Array.isArray(body.recentSecurityAlerts)).toBe(true);
  });

  it('GET /api/analytics/patient/:patientId deve mapear linha do tempo de evolução longitudinal', async () => {
    const { patientId, appt1Id } = await seedClinicalData();

    const res = await app.request(`/api/analytics/patient/${patientId}`, {
      headers: { Authorization: `Bearer ${psychologistToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.patientId).toBe(patientId);
    expect(body.patientName).toBe('Mariana Silva de Oliveira');
    expect(body.totalAppointments).toBeGreaterThanOrEqual(2);
    expect(body.completedAppointments).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(body.evolutionTimeline)).toBe(true);
    expect(body.evolutionTimeline.length).toBeGreaterThanOrEqual(2);

    const firstEvolution = body.evolutionTimeline.find((e: any) => e.sessionId === appt1Id);
    expect(firstEvolution).toBeDefined();
    expect(firstEvolution.hasSoap).toBe(true);
    expect(firstEvolution.isSigned).toBe(true);
    expect(firstEvolution.soapSubjectiveSummary).toContain('melhora');
  });

  it('deve retornar 404 para paciente inexistente em métricas individuais', async () => {
    const res = await app.request('/api/analytics/patient/00000000-0000-0000-0000-nonexistent', {
      headers: { Authorization: `Bearer ${psychologistToken}` }
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('deve aplicar RBAC estrito: bloquear acesso de secretária a métricas clínicas e de segurança (403)', async () => {
    const { patientId } = await seedClinicalData();

    // Secretária tentando ver visão clínica geral -> 403 Forbidden
    const clinicalRes = await app.request('/api/analytics/clinical-overview', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(clinicalRes.status).toBe(403);

    // Secretária tentando ver observabilidade de segurança -> 403 Forbidden
    const securityRes = await app.request('/api/analytics/security-metrics', {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(securityRes.status).toBe(403);

    // Secretária tentando ver evolução clínica de paciente -> 403 Forbidden
    const patientRes = await app.request(`/api/analytics/patient/${patientId}`, {
      headers: { Authorization: `Bearer ${secretaryToken}` }
    });
    expect(patientRes.status).toBe(403);
  });

  it('Admin/DPO não acessa métricas clínicas nem trechos de SOAP (RFC-001 §4.5)', async () => {
    const { patientId } = await seedClinicalData();
    const admin = (await listUsers()).find((u) => u.role === UserRole.ADMIN)!;
    const { accessToken } = await authService.issueTokens(admin, '127.0.0.1');
    const headers = { Authorization: `Bearer ${accessToken}` };

    expect((await app.request('/api/analytics/clinical-overview', { headers })).status).toBe(403);
    expect((await app.request('/api/analytics/clinical-overview?therapistId=therapist-001', { headers })).status).toBe(403);
    expect((await app.request(`/api/analytics/patient/${patientId}`, { headers })).status).toBe(403);
  });

  it('deve bloquear requisições sem token de autenticação (401 Unauthorized)', async () => {
    const unauthClinical = await app.request('/api/analytics/clinical-overview');
    expect(unauthClinical.status).toBe(401);

    const unauthSecurity = await app.request('/api/analytics/security-metrics');
    expect(unauthSecurity.status).toBe(401);

    const unauthPatient = await app.request('/api/analytics/patient/any-id');
    expect(unauthPatient.status).toBe(401);
  });
});
