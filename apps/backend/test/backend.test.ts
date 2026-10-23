import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { AppointmentService } from '../src/services/appointmentService';
import { PatientService } from '../src/services/patientService';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { authService } from '../src/services/authService';
import { AppointmentStatus } from '@terapiainfoco/shared';
import { resetDb, requireUser, seedDemoSession } from './helpers/db';

import { PatientRepository } from '../src/repositories/patientRepository';
describe('TerapiaInFoco Backend API (RFC-001 Integration)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();
    const psicologa = (await requireUser('00000000-0000-0000-0000-000000000001'));
    ({ accessToken } = await authService.issueTokens(psicologa, '127.0.0.1'));
  });

  /** Requisição autenticada como a psicóloga titular demo */
  function staffRequest(path: string, init: RequestInit = {}) {
    return app.request(path, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` }
    });
  }


  it('GET /health deve retornar status OK e metadados de conformidade', async () => {
    const res = await staffRequest('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.rfc).toBe('RFC-001');
    expect(body.compliance.cfp).toContain('001/2009');
  });

  it('Fluxo de Paciente com Field-Level Encryption e Blind Indexing', async () => {
    // 1. Cadastra paciente
    const createRes = await staffRequest('/api/patients', {
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
    const stored = await PatientRepository.findById(patientId);
    expect(stored).toBeDefined();
    expect(stored?.encryptedName.ciphertext).not.toBe('Mariana Silva');
    expect(stored?.encryptedEmail.ciphertext).not.toBe('mariana.silva@email.com');

    // 3. Busca por CPF usando Blind Index (HMAC-SHA256)
    const searchRes = await staffRequest('/api/patients/search/cpf?cpf=123.456.789-00');
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.patient.name).toBe('Mariana Silva');
    expect(searchData.patient.id).toBe(patientId);
  });

  it('Fluxo de Agendamento, Buffer Obrigatório e Sala de Teleconsulta Própria (Módulo 1 & 2)', async () => {
    // Cria paciente primeiro
    const patientRes = await staffRequest('/api/patients', {
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
    const appRes1 = await staffRequest('/api/appointments', {
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
    expect(appointment.roomUrl).toBe(`http://localhost:5174/?sala=${appointment.id}`);
    expect(appointment.meetUrl).toBeUndefined();
    expect(appointment.status).toBe(AppointmentStatus.CONFIRMADA);

    // 2. Tenta agendar colado sem respeitar o buffer de 10 min
    const invalidStart = new Date(end1.getTime() + 5 * 60 * 1000); // apenas 5 min após (buffer exige 10)
    const invalidEnd = new Date(invalidStart.getTime() + 50 * 60 * 1000);

    const appResConflict = await staffRequest('/api/appointments', {
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
    // Prontuário só pode ser criado para paciente e consulta do próprio consultório
    await seedDemoSession();
    // 1. Salva rascunho de nota clínica SOAP
    const draftRes = await staffRequest('/api/clinical-records/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
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
    const invalidSignRes = await staffRequest('/api/clinical-records/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: record.id,
        confirmedHumanReview: false
      })
    });
    expect(invalidSignRes.status).toBe(400);

    // 3. Assina com confirmação humana explícita (Human-in-the-Loop aprovado)
    const validSignRes = await staffRequest('/api/clinical-records/sign', {
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
    const tamperRes = await staffRequest('/api/clinical-records/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: '00000000-0000-0000-0000-000000000010',
        patientId: '00000000-0000-0000-0000-000000000002',
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
    await staffRequest('/api/patients', {
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

    const auditRes = await staffRequest('/api/audit');
    expect(auditRes.status).toBe(200);
    const auditData = await auditRes.json();
    expect(auditData.count).toBeGreaterThan(0);
    const creation = auditData.logs.find((log: any) => log.resourceType === 'PATIENT');
    expect(creation.action).toBe('CREATE');
    expect(creation.actorId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('Emissão, Assinatura Digital e Validação Pública de Documentos Psicológicos (Módulo 5 - CFP nº 006/2019)', async () => {
    // 1. Cadastra paciente para o documento
    const patientRes = await staffRequest('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Roberto Carlos Braga',
        email: 'roberto@email.com',
        phone: '11988887777',
        cpf: '987.654.321-99',
        consentTranscriptionSigned: true
      })
    });
    const patientData = await patientRes.json();
    const patientId = patientData.patient.id;

    // 2. Emite rascunho de Atestado Psicológico
    const draftRes = await staffRequest('/api/documents/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId,
        type: 'ATESTADO',
        title: 'Atestado Psicológico para Fins de Afastamento',
        content: 'Atesto para os devidos fins que o paciente encontra-se em acompanhamento psicológico.'
      })
    });

    expect(draftRes.status).toBe(201);
    const doc = await draftRes.json();
    expect(doc.id).toBeDefined();
    expect(doc.validationToken).toBeDefined();
    expect(doc.isSigned).toBe(false);

    // 3. Validação pública antes da assinatura deve falhar
    const invalidValidateRes = await staffRequest(`/api/documents/validate/${doc.validationToken}`);
    expect(invalidValidateRes.status).toBe(404);

    // 4. Assina digitalmente o documento
    const signRes = await staffRequest('/api/documents/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id })
    });

    expect(signRes.status).toBe(200);
    const signedDoc = await signRes.json();
    expect(signedDoc.isSigned).toBe(true);
    expect(signedDoc.signaturePadesHash).toBeDefined();

    // 5. Tentativa de re-assinar documento já assinado deve falhar
    const reSignRes = await staffRequest('/api/documents/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id })
    });
    expect(reSignRes.status).toBe(400);

    // 6. Validação pública via Token / QR Code (Zero-Knowledge)
    const publicValidateRes = await staffRequest(`/api/documents/validate/${doc.validationToken}`);
    expect(publicValidateRes.status).toBe(200);
    const validation = await publicValidateRes.json();
    expect(validation.valid).toBe(true);
    expect(validation.document.therapistName).toBe('Dra. Vanessa Andrade');
    expect(validation.document.therapistCrp).toBe('06/142980');
    expect(validation.document.type).toBe('ATESTADO');
    // Verifica preservação de privacidade LGPD (apenas iniciais)
    expect(validation.document.patientInitials).toBe('R. C. B.');
    expect(validation.document.signaturePadesHash).toBe(signedDoc.signaturePadesHash);
  });

  it('Pipeline de Transcrição, Diarização, Sanitização LGPD Art. 11 e IA SOAP (Módulo 3 - RFC §3.3)', async () => {
    // 1. Cadastra paciente SEM consentimento de transcrição
    const patientNoConsentRes = await staffRequest('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Carlos Eduardo',
        email: 'carlos@email.com',
        phone: '11911112222',
        consentTranscriptionSigned: false
      })
    });
    const patientNoConsentData = await patientNoConsentRes.json();
    const patientNoConsentId = patientNoConsentData.patient.id;

    // Cria agendamento para este paciente
    const apptNoConsentRes = await staffRequest('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId: patientNoConsentId,
        scheduledStart: new Date(Date.now() + 7200000).toISOString(),
        scheduledEnd: new Date(Date.now() + 10200000).toISOString()
      })
    });
    const apptNoConsentData = await apptNoConsentRes.json();

    // Síntese por IA DEVE FALHAR sem consentimento de transcrição/IA (LGPD Art. 11), mesmo com o flag do cliente
    const blockedIngestRes = await staffRequest('/api/transcription/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: apptNoConsentData.appointment.id,
        patientId: patientNoConsentId,
        consentConfirmed: true,
        rawTranscriptText: 'PACIENTE: Tenho dormido mal.'
      })
    });
    expect(blockedIngestRes.status).toBe(403);
    expect((await blockedIngestRes.json()).message).toContain('Consentimento');

    // 2. Cadastra paciente COM consentimento de transcrição (TCLE)
    const patientWithConsentRes = await staffRequest('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        name: 'Mariana Silva de Oliveira',
        email: 'mariana.silva@email.com',
        phone: '11987654321',
        cpf: '123.456.789-00',
        consentTranscriptionSigned: true
      })
    });
    const patientWithConsentData = await patientWithConsentRes.json();
    const patientId = patientWithConsentData.patient.id;

    // Cria agendamento
    const apptRes = await staffRequest('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        therapistId: 'therapist-001',
        patientId,
        scheduledStart: new Date(Date.now() + 14400000).toISOString(),
        scheduledEnd: new Date(Date.now() + 17400000).toISOString()
      })
    });
    const apptData = await apptRes.json();
    const appointmentId = apptData.appointment.id;

    // 3. Paciente de outra consulta não é aceito na ingestão
    const mismatchRes = await staffRequest('/api/transcription/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, patientId: patientNoConsentId, consentConfirmed: true, rawTranscriptText: 'PACIENTE: Oi.' })
    });
    expect(mismatchRes.status).toBe(404);

    // 4. Transcrição diarizada → minuta SOAP pelo sintetizador (RFC §3.3)
    const ingestRes = await staffRequest('/api/transcription/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true,
        rawTranscriptText: 'TERAPEUTA: Como foi a sua semana?\nPACIENTE: Tive uma reunião tensa e senti aperto no peito, mas usei a respiração diafragmática.'
      })
    });
    expect(ingestRes.status).toBe(201);
    const ingestData = await ingestRes.json();
    expect(ingestData.session.utterances.length).toBe(2);
    expect(ingestData.soapDraft.subjectiveText).toBeDefined();

    // 5. Minuta revisada salva como rascunho da consulta e assinada com Human-in-the-Loop
    const draftSoapRes = await staffRequest('/api/clinical-records/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId,
        soap: {
          subjective: ingestData.soapDraft.subjectiveText,
          objective: ingestData.soapDraft.objectiveText,
          assessment: ingestData.soapDraft.assessmentText,
          plan: ingestData.soapDraft.planText
        }
      })
    });
    expect(draftSoapRes.status).toBe(201);
    const recordData = await draftSoapRes.json();

    const signSoapRes = await staffRequest('/api/clinical-records/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: recordData.record.id,
        confirmedHumanReview: true
      })
    });
    expect(signSoapRes.status).toBe(200);
    const signedData = await signSoapRes.json();
    expect(signedData.record.isSigned).toBe(true);
    expect(signedData.record.signatureHash).toBeDefined();
  });

  it('Horários disponíveis e regras do agendamento direto (RFC §3.1)', async () => {
    // 1. Consulta horários disponíveis
    // Data sempre futura: horários passados não são oferecidos
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const slotsRes = await staffRequest(`/api/appointments/available-slots?therapistId=therapist-001&date=${futureDate}`);
    expect(slotsRes.status).toBe(200);
    const slotsData = await slotsRes.json();
    expect(slotsData.slots.length).toBeGreaterThan(0);
    expect(slotsData.bufferMinutes).toBe(10);
    const firstOpenSlot = slotsData.slots.find((s: any) => s.available);
    expect(firstOpenSlot).toBeDefined();

    // 2. O agendamento anônimo não é mais exposto por HTTP (a landing leva à busca com login):
    // sem token cai na autenticação das rotas do consultório; com token, a rota não existe
    expect((await app.request('/api/appointments/public/book', { method: 'POST' })).status).toBe(401);
    expect((await staffRequest('/api/appointments/public/book', { method: 'POST' })).status).toBe(404);

    // 3. O horário ocupado não aceita uma segunda consulta (buffer entre sessões)
    const context = { actorId: 'therapist-001', ipAddress: '127.0.0.1' };
    const slot = { scheduledStart: firstOpenSlot.start, scheduledEnd: firstOpenSlot.end };
    const first = await PatientService.createPatient('therapist-001', { name: 'Lucas Ferreira', email: 'lucas@email.com', phone: '11977778888', consentTranscriptionSigned: false }, context);
    const other = await PatientService.createPatient('therapist-001', { name: 'Outro Paciente', email: 'outro@email.com', phone: '11966667777', consentTranscriptionSigned: false }, context);
    const appointment = await AppointmentService.createAppointment('therapist-001', { patientId: first.id, ...slot }, context);
    expect(appointment.roomUrl).toContain(`sala=${appointment.id}`);

    await expect(AppointmentService.createAppointment('therapist-001', { patientId: other.id, ...slot }, context))
      .rejects.toThrow('Conflito de agenda');
  });
});


