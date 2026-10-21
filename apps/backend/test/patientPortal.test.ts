import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AuthService } from '../src/services/authService';
import { PatientService } from '../src/services/patientService';
import { BillingReceiptService } from '../src/services/billingReceiptService';
import {
  ExerciseType,
  ExerciseStatus,
  ReceiptPurpose,
  BillingModality,
  PaymentMethod,
  AuditAction
} from '@terapiainfoco/shared';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { resetDb } from './helpers/db';

describe('Portal do Paciente Autenticado & Exercícios Terapêuticos (RFC-001 §3.6, §3.7)', () => {
  let therapistToken: string;
  let patientId: string;
  let patientEmail: string;
  let patientToken: string;

  beforeEach(async () => {
    await resetDb();

    const authService = new AuthService();
    const loginRes = await authService.login({
      email: 'psicologo@terapiainfoco.com.br',
      password: 'Senha@123456'
    });
    therapistToken = loginRes.accessToken!;

    patientEmail = 'ana.paula.paciente@gmail.com';
    const patient = PatientService.createPatient(
      'therapist-001',
      {
        name: 'Ana Paula Ferreira',
        email: patientEmail,
        cpf: '123.456.789-00',
        phone: '(11) 98765-4321',
        consentTranscriptionSigned: false
      },
      { actorId: '00000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' }
    );
    patientId = patient.id;

    // Emite um recibo para testes de acesso financeiro do paciente
    await BillingReceiptService.generateReceipt({
      therapistId: 'therapist-001',
      dto: {
        patientId,
        purpose: ReceiptPurpose.CONVENIO_REIMBURSO,
        modality: BillingModality.PER_SESSION,
        amountCents: 22000,
        paymentMethod: PaymentMethod.PIX,
        sessionsCovered: [{ data: '2026-10-10', modalidade: 'ONLINE' }]
      },
      context: {
        actorId: '00000000-0000-0000-0000-000000000001',
        ipAddress: '127.0.0.1'
      }
    });
  });

  it('1. deve solicitar e emitir código de acesso descartável para e-mail de paciente válido', async () => {
    const res = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.code).toBeDefined();
    expect(data.code).toHaveLength(6);

    // Auditoria WORM registrada
    const audit = db.auditLogs.find(a => a.action === AuditAction.PATIENT_PORTAL_AUTH_REQUESTED);
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(patientId);
  });

  it('2. deve rejeitar solicitação de código para e-mail não cadastrado com 404', async () => {
    const res = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inexistente@dominio.com' })
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('3. deve autenticar paciente com código de 6 dígitos e emitir sessão JWT com fé pública', async () => {
    // 1. Pede código
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const reqData = await reqRes.json();
    const code = reqData.code;

    // 2. Valida código
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.token).toBeDefined();
    expect(verifyData.profile.id).toBe(patientId);
    expect(verifyData.profile.name).toBe('Ana Paula Ferreira');
    expect(verifyData.profile.initials).toBe('A. P. F.');
    expect(verifyData.profile.therapistName).toBe('Dra. Beatriz Santos');

    // Salva token para os próximos testes
    patientToken = verifyData.token;

    // Código usado deve ter sido consumido (não pode ser reutilizado)
    const reuseRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });
    expect(reuseRes.status).toBe(401);
  });

  it('4. deve obter overview do portal com próxima consulta, contadores de exercícios e recibos', async () => {
    // Obter token de paciente
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const reqData = await reqRes.json();
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code: reqData.code })
    });
    const { token } = await verifyRes.json();

    const overviewRes = await app.request('/api/patient-portal/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(overviewRes.status).toBe(200);
    const overviewData = await overviewRes.json();
    expect(overviewData.success).toBe(true);
    expect(overviewData.data.profile.email).toBe(patientEmail);
    expect(overviewData.data.availableReceiptsCount).toBe(1);
    expect(overviewData.data.pendingExercisesCount).toBe(0);
  });

  it('5. terapeuta deve prescrever exercício terapêutico RPD (TCC) e paciente deve listá-lo no portal', async () => {
    // 1. Terapeuta prescreve exercício
    const assignRes = await app.request('/api/patient-portal/therapist/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        title: 'Registro de Pensamentos Disfuncionais (RPD)',
        description: 'Identifique gatilhos de ansiedade durante a semana e anote a resposta adaptativa.',
        type: ExerciseType.RPD_THOUGHT_RECORD,
        dueAt: '2026-10-23'
      })
    });

    expect(assignRes.status).toBe(201);
    const assignData = await assignRes.json();
    expect(assignData.success).toBe(true);
    expect(assignData.exercise.status).toBe(ExerciseStatus.ASSIGNED);
    expect(assignData.exercise.templateData.fields).toBeDefined();

    // 2. Paciente autentica e lista seus exercícios
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const { code } = await reqRes.json();
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });
    const { token } = await verifyRes.json();

    const listRes = await app.request('/api/patient-portal/exercises', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.success).toBe(true);
    expect(listData.exercises).toHaveLength(1);
    expect(listData.exercises[0].title).toBe('Registro de Pensamentos Disfuncionais (RPD)');
  });

  it('6. paciente deve responder exercício com cifragem AES-256-GCM e terapeuta deve revisar com feedback', async () => {
    // 1. Prescreve exercício
    const assignRes = await app.request('/api/patient-portal/therapist/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        title: 'Rastreador de Humor & Gatilhos',
        description: 'Monitore as oscilações de humor diárias.',
        type: ExerciseType.MOOD_TRACKER
      })
    });
    const { exercise } = await assignRes.json();

    // 2. Paciente loga
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const { code } = await reqRes.json();
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });
    const { token } = await verifyRes.json();

    // 3. Paciente submete resposta
    const submitRes = await app.request('/api/patient-portal/exercises/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        exerciseId: exercise.id,
        answers: {
          score: 8,
          primaryEmotion: 'Esperança e alívio',
          triggers: 'Conversa franca com a família e caminhada matinal.',
          gratitude: 'Ter tempo de qualidade para descansar sem culpa.'
        },
        notes: 'Senti que consegui desacelerar os pensamentos.'
      })
    });

    expect(submitRes.status).toBe(200);
    const submitData = await submitRes.json();
    expect(submitData.success).toBe(true);
    expect(submitData.exercise.status).toBe(ExerciseStatus.COMPLETED);
    expect(submitData.exercise.completedAt).toBeDefined();

    // Verifica que o payload em repouso no banco está cifrado (AES-256-GCM)
    const stored = db.therapeuticExercises.get(exercise.id);
    expect(stored?.encryptedPayload).toBeDefined();
    expect(stored?.encryptedPayload?.ciphertext).toBeDefined();
    expect(stored?.encryptedPayload?.iv).toBeDefined();
    expect(stored?.encryptedPayload?.authTag).toBeDefined();

    // 4. Terapeuta revisa o exercício
    const reviewRes = await app.request('/api/patient-portal/therapist/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        exerciseId: exercise.id,
        feedback: 'Excelente reflexão! Note como a caminhada e a conversa ativaram seu sistema de acolhimento e reduziram a ruminação. Vamos aprofundar na sessão de quinta.'
      })
    });

    expect(reviewRes.status).toBe(200);
    const reviewData = await reviewRes.json();
    expect(reviewData.success).toBe(true);
    expect(reviewData.exercise.status).toBe(ExerciseStatus.REVIEWED);
    expect(reviewData.exercise.therapistFeedback).toContain('Excelente reflexão');
  });

  it('7. deve prevenir IDOR: paciente não pode responder a exercício de outro paciente', async () => {
    // Cria paciente 2
    const patient2 = PatientService.createPatient(
      'therapist-001',
      {
        name: 'Carlos Alberto Mendes',
        email: 'carlos.mendes@gmail.com',
        cpf: '987.654.321-99',
        phone: '(11) 91111-2222',
        consentTranscriptionSigned: false
      },
      { actorId: '00000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' }
    );

    // Exercício do paciente 2
    const assignRes = await app.request('/api/patient-portal/therapist/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId: patient2.id,
        title: 'Inventário de Valores ACT',
        description: 'Clareza de valores e compromissos.',
        type: ExerciseType.VALUES_CLARIFICATION
      })
    });
    const { exercise } = await assignRes.json();

    // Paciente 1 tenta responder exercício do paciente 2
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const { code } = await reqRes.json();
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });
    const { token } = await verifyRes.json();

    const attackRes = await app.request('/api/patient-portal/exercises/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        exerciseId: exercise.id,
        answers: { lifeDomain: 'Tentativa de Injeção / IDOR' }
      })
    });

    expect(attackRes.status).toBe(400);
    const attackData = await attackRes.json();
    expect(attackData.success).toBe(false);
    expect(attackData.message).toContain('Acesso negado');
  });

  it('8. paciente deve listar recibos de honorários para reembolso com registro de auditoria WORM', async () => {
    // Paciente loga
    const reqRes = await app.request('/api/patient-portal/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail })
    });
    const { code } = await reqRes.json();
    const verifyRes = await app.request('/api/patient-portal/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientEmail, code })
    });
    const { token } = await verifyRes.json();

    const receiptsRes = await app.request('/api/patient-portal/receipts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(receiptsRes.status).toBe(200);
    const receiptsData = await receiptsRes.json();
    expect(receiptsData.success).toBe(true);
    expect(receiptsData.receipts).toHaveLength(1);
    expect(receiptsData.receipts[0].amountCents).toBe(22000);
    expect(receiptsData.receipts[0].purpose).toBe(ReceiptPurpose.CONVENIO_REIMBURSO);

    // Auditoria WORM de acesso ao recibo registrada
    const receiptAudit = db.auditLogs.find(a => a.action === AuditAction.PATIENT_RECEIPT_ACCESSED);
    expect(receiptAudit).toBeDefined();
    expect(receiptAudit?.actorId).toBe(patientId);
  });

  it('portal recusa refresh tokens e tokens de outros perfis', async () => {
    await globalRateLimitStore.reset();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'psicologo@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    const { accessToken, refreshToken } = await loginRes.json() as any;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
    for (const token of [accessToken, refreshToken]) {
      const res = await app.request('/api/patient-portal/overview', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(401);
    }
  });
});
