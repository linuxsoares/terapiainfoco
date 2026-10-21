import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import {
  TranscriptionSpeaker,
  TranscriptionStatus,
  AiSoapDraftStatus,
  ConversationalSentiment,
  AuditAction,
  ClinicalMarkerCategory
} from '@terapiainfoco/shared';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { resetDb, seedDemoSession } from './helpers/db';

import { ClinicalRecordRepository } from '../src/repositories/clinicalRecordRepository';
describe('Módulo de Transcrição Assistida por IA, Diarização & Síntese SOAP (RFC-001 §3.3)', () => {
  const appointmentId = '00000000-0000-0000-0000-000000000010';
  const patientId = '00000000-0000-0000-0000-000000000002';
  let token: string;

  beforeAll(async () => {

    // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

    await globalRateLimitStore.reset();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json() as any;
    token = loginData.accessToken;
  });

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
  });

  it('deve rejeitar ingestão de transcrição se consentConfirmed for false (CFP nº 011/2018 & LGPD Art. 7º)', async () => {
    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: false,
        rawTranscriptText: 'Texto sem consentimento'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Consentimento');
  });

  it('deve diarizar diálogo e calcular métricas conversacionais (Talk-to-Listen Ratio)', async () => {
    const rawTranscript = `
[TERAPEUTA]: Boa tarde, como tem passado nos últimos dias?
[PACIENTE]: Olá doutora, tive muitas crises de ansiedade no trabalho e não consegui dormir bem.
[TERAPEUTA]: Compreendo. O que você acha que desencadeou essa piora no sono?
[PACIENTE]: Muito medo de falhar na apresentação da empresa. Me sinto constantemente pressionado.
[TERAPEUTA]: Vamos respirar fundo e analisar essas cobranças internas.
    `;

    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true,
        rawTranscriptText: rawTranscript
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    const session = body.session;
    expect(session.status).toBe(TranscriptionStatus.COMPLETED);
    expect(session.utterances.length).toBe(5);

    // Locutores alternados
    expect(session.utterances[0].speaker).toBe(TranscriptionSpeaker.THERAPIST);
    expect(session.utterances[1].speaker).toBe(TranscriptionSpeaker.PATIENT);

    // Métricas conversacionais
    expect(session.metrics.therapistTalkTimeSeconds).toBeGreaterThan(0);
    expect(session.metrics.patientTalkTimeSeconds).toBeGreaterThan(0);
    expect(session.metrics.turnTakingCount).toBe(4);
    expect(session.metrics.clinicalBalanceAdvice).toBeDefined();
  });

  it('deve sintetizar rascunho SOAP estruturado nos 4 quadrantes com sugestões de CID-11', async () => {
    const rawTranscript = `
[TERAPEUTA]: Olá Mariana, como você se sentiu desde o nosso último atendimento?
[PACIENTE]: Doutora, sinto muita ansiedade e angústia quando penso nas tarefas do trabalho. Passo noites em claro sem sono.
[TERAPEUTA]: Quais são os pensamentos automáticos que vêm à mente quando a insônia começa?
[PACIENTE]: Penso que não vou dar conta e que todos vão me julgar.
[TERAPEUTA]: Vamos combinar um registro diário desses pensamentos e praticar a respiração diafragmática.
    `;

    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true,
        rawTranscriptText: rawTranscript
      })
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    const draft = body.soapDraft;

    expect(draft.status).toBe(AiSoapDraftStatus.DRAFT_PENDING_REVIEW);
    expect(draft.subjectiveText).toContain('ansiedade');
    expect(draft.objectiveText).toContain('comunicativo');
    expect(draft.assessmentText).toContain('6B00');
    expect(draft.planText).toContain('semanal');
    expect(draft.suggestedCid11Codes).toContain('6B00');
    expect(draft.zeroRetentionGuaranteed).toBe(true);
  });

  it('deve correlacionar marcadores clínicos pré-existentes da teleconsulta', async () => {
    // Adiciona marcador de insight na sessão
    const markerId = 'marker-insight-001';
    db.clinicalMarkers.set(markerId, {
      id: markerId,
      appointmentId,
      patientId,
      therapistId: 'therapist-001',
      category: ClinicalMarkerCategory.INSIGHT,
      relevance: 'HIGH' as any,
      timestampMs: 20000,
      timeFormatted: '00:20',
      encryptedNote: { ciphertext: 'c', iv: 'iv', authTag: 'tag' },
      createdAt: new Date().toISOString()
    });

    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true,
        includeClinicalMarkers: true
      })
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    const session = body.session;

    // Pelo menos um enunciado deve estar vinculado ao marcador
    const hasLinkedMarker = session.utterances.some((u: any) => u.linkedMarkerId === markerId);
    expect(hasLinkedMarker).toBe(true);
  });

  it('deve gerar alerta ético se detectado marcador de crise ou ideação', async () => {
    const crisisTranscript = `
[PACIENTE]: Doutora, não aguento mais, sinto um desespero profundo e vontade de acabar com tudo.
[TERAPEUTA]: Estou aqui com você. Sua vida importa muito. Vamos acionar sua irmã agora mesmo.
    `;

    const res = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true,
        rawTranscriptText: crisisTranscript
      })
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.soapDraft.safetyWarning).toBeDefined();
    expect(body.soapDraft.safetyWarning).toContain('ATENÇÃO ÉTICA CFP');
  });

  it('deve recuperar a sessão de transcrição via GET /api/transcription/session/:appointmentId', async () => {
    // Primeiro ingere
    await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true
      })
    });

    // Depois consulta
    const res = await app.request(`/api/transcription/session/${appointmentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session.appointmentId).toBe(appointmentId);
    expect(body.soapDraft).toBeDefined();
  });

  it('deve permitir revisão humana (Human-in-the-Loop) modificando os quadrantes SOAP', async () => {
    const ingestRes = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true
      })
    });
    const ingestBody = await ingestRes.json();
    const draftId = ingestBody.soapDraft.id;

    // Terapeuta modifica os quadrantes
    const reviewRes = await app.request('/api/transcription/draft/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        draftId,
        status: 'MODIFIED_BY_THERAPIST',
        reviewedSubjective: 'Texto subjetivo revisado pelo psicólogo clínico.',
        reviewedObjective: 'Comportamento sereno e reflexivo.',
        reviewedAssessment: 'Hipótese diagnóstica confirmada de ansiedade adaptativa.',
        reviewedPlan: 'Manutenção de sessões quinzenais.',
        finalCid11: '6B00.0',
        reviewNotes: 'Revisado e aprovado com pequenas adequações terminológicas.'
      })
    });

    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();
    expect(reviewBody.success).toBe(true);
    expect(reviewBody.draft.status).toBe(AiSoapDraftStatus.MODIFIED_BY_THERAPIST);
    expect(reviewBody.draft.subjectiveText).toBe('Texto subjetivo revisado pelo psicólogo clínico.');
    expect(reviewBody.draft.suggestedCid11Codes).toContain('6B00.0');
  });

  it('deve converter rascunho revisado em Prontuário Oficial do Paciente (EHR) quando saveAsOfficialEhrNote for true', async () => {
    const ingestRes = await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true
      })
    });
    const ingestBody = await ingestRes.json();
    const draftId = ingestBody.soapDraft.id;

    const initialRecordsCount = await ClinicalRecordRepository.count();

    const reviewRes = await app.request('/api/transcription/draft/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        draftId,
        status: 'ACCEPTED_BY_THERAPIST',
        saveAsOfficialEhrNote: true
      })
    });

    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();
    expect(reviewBody.success).toBe(true);
    expect(reviewBody.createdEhrRecordId).toBeDefined();

    // Deve ter adicionado nova nota oficial no prontuário
    expect(await ClinicalRecordRepository.count()).toBe(initialRecordsCount + 1);

    const savedRecord = await ClinicalRecordRepository.findById(reviewBody.createdEhrRecordId);
    expect(savedRecord).toBeDefined();
    expect(savedRecord?.patientId).toBe(patientId);
    expect(savedRecord?.isSigned).toBe(true);
    expect(savedRecord?.signatureHash).toBeDefined();
    expect(savedRecord?.therapistId).toBe('therapist-001');
    expect(savedRecord?.encryptedSoapSubjective).toBeDefined();
  });

  it('deve registrar trilha de auditoria WORM imutável em todas as operações de IA e transcrição', async () => {
    await app.request('/api/transcription/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        appointmentId,
        patientId,
        consentConfirmed: true
      })
    });

    const consentLogs = db.auditLogs.filter(
      l => l.action === AuditAction.TRANSCRIPTION_CONSENT_VERIFIED
    );
    expect(consentLogs.length).toBeGreaterThan(0);

    const diarizationLogs = db.auditLogs.filter(
      l => l.action === AuditAction.TRANSCRIPTION_DIARIZED
    );
    expect(diarizationLogs.length).toBeGreaterThan(0);

    const soapLogs = db.auditLogs.filter(
      l => l.action === AuditAction.AI_SOAP_SYNTHESIZED
    );
    expect(soapLogs.length).toBeGreaterThan(0);
  });
});
