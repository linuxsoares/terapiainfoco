import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AppointmentStatus } from '@terapiainfoco/shared';

describe('TerapiaInFoco Backend API (RFC-001 Integration)', () => {
  beforeEach(() => {
    db.clear();
  });

  it('GET /health deve retornar status OK e metadados de conformidade', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.rfc).toBe('RFC-001');
    expect(body.compliance.cfp).toContain('001/2009');
  });

  it('Fluxo de Paciente com Field-Level Encryption e Blind Indexing', async () => {
    // 1. Cadastra paciente
    const createRes = await app.request('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Mariana Silva',
        email: 'mariana.silva@email.com',
        phone: '11987654321',
        cpf: '123.456.789-00',
        consentTranscriptionSigned: true
      })
    });

    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const patientId = createData.patient.id;
    expect(patientId).toBeDefined();

    // 2. Verifica se no banco relacional os dados brutos estão cifrados (não há texto claro)
    const stored = db.patients.get(patientId);
    expect(stored).toBeDefined();
    expect(stored?.encryptedName.ciphertext).not.toBe('Mariana Silva');
    expect(stored?.encryptedEmail.ciphertext).not.toBe('mariana.silva@email.com');

    // 3. Busca por CPF usando Blind Index (HMAC-SHA256)
    const searchRes = await app.request('/api/patients/search/cpf?cpf=123.456.789-00');
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.patient.name).toBe('Mariana Silva');
    expect(searchData.patient.id).toBe(patientId);
  });

  it('Fluxo de Agendamento, Buffer Obrigatório e Google Meet (Módulo 1 & 2)', async () => {
    // Cria paciente primeiro
    const patientRes = await app.request('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Carlos Eduardo',
        email: 'carlos@email.com',
        phone: '11988887777',
        consentTranscriptionSigned: true
      })
    });
    const { patient } = await patientRes.json();

    const start1 = new Date(Date.now() + 24 * 3600 * 1000); // amanhã
    const end1 = new Date(start1.getTime() + 50 * 60 * 1000); // 50 min de sessão

    // 1. Agenda sessão 1
    const appRes1 = await app.request('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId: patient.id,
        scheduledStart: start1.toISOString(),
        scheduledEnd: end1.toISOString(),
        bufferMinutes: 10
      })
    });

    expect(appRes1.status).toBe(201);
    const { appointment } = await appRes1.json();
    expect(appointment.meetUrl).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(appointment.meetAccessCode).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMADA);

    // 2. Tenta agendar colado sem respeitar o buffer de 10 min
    const invalidStart = new Date(end1.getTime() + 5 * 60 * 1000); // apenas 5 min após (buffer exige 10)
    const invalidEnd = new Date(invalidStart.getTime() + 50 * 60 * 1000);

    const appResConflict = await app.request('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId: patient.id,
        scheduledStart: invalidStart.toISOString(),
        scheduledEnd: invalidEnd.toISOString(),
        bufferMinutes: 10
      })
    });

    expect(appResConflict.status).toBe(400);
    const conflictData = await appResConflict.json();
    expect(conflictData.error).toContain('Conflito de agenda');
  });

  it('Fluxo SOAP, Human-in-the-Loop compulsório e Imutabilidade (Módulo 3 & 4)', async () => {
    // 1. Salva rascunho de nota clínica SOAP
    const draftRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: 'app-001',
        patientId: 'pat-001',
        therapistId: 'therapist-001',
        sessionNumber: 1,
        soap: {
          subjective: 'Paciente relata remissão das crises de pânico.',
          objective: 'Apresenta humor eutímico, postura receptiva.',
          assessment: 'Boa evolução sob técnicas comportamentais.',
          plan: 'Manter diário de pensamentos para a próxima semana.'
        },
        privateNotes: 'Anotação reflexiva sigilosa do psicólogo.'
      })
    });

    expect(draftRes.status).toBe(201);
    const { record } = await draftRes.json();
    expect(record.isSigned).toBe(false);

    // 2. Tenta assinar sem confirmação humana (deve falhar por exigência da RFC §3.3)
    const invalidSignRes = await app.request('/api/clinical-records/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: record.id,
        confirmedHumanReview: false
      })
    });
    expect(invalidSignRes.status).toBe(400);

    // 3. Assina com confirmação humana explícita (Human-in-the-Loop aprovado)
    const validSignRes = await app.request('/api/clinical-records/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: record.id,
        confirmedHumanReview: true
      })
    });

    expect(validSignRes.status).toBe(200);
    const signedData = await validSignRes.json();
    expect(signedData.record.isSigned).toBe(true);
    expect(signedData.record.signatureHash).toBeDefined();

    // 4. Tenta editar registro assinado (deve falhar por Imutabilidade do CFP 001/2009)
    const tamperRes = await app.request('/api/clinical-records/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: 'app-001',
        patientId: 'pat-001',
        therapistId: 'therapist-001',
        sessionNumber: 1,
        soap: {
          subjective: 'Tentativa de alteração pós-assinatura',
          objective: '',
          assessment: '',
          plan: ''
        }
      })
    });

    expect(tamperRes.status).toBe(400);
    const tamperData = await tamperRes.json();
    expect(tamperData.error).toContain('já assinado e imutável');
  });

  it('Trilha de Auditoria Imutável (WORM - Seção 4.4)', async () => {
    // Cadastra paciente e consulta
    await app.request('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Ana Clara',
        email: 'ana@email.com',
        phone: '11999990000',
        consentTranscriptionSigned: true
      })
    });

    const auditRes = await app.request('/api/audit');
    expect(auditRes.status).toBe(200);
    const auditData = await auditRes.json();
    expect(auditData.count).toBeGreaterThan(0);
    expect(auditData.logs[0].action).toBe('CREATE');
    expect(auditData.logs[0].resourceType).toBe('PATIENT');
  });
});
