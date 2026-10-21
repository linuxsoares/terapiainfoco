import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { DlpPolicyMode, DlpRiskLevel, SteganographyInspectionStatus } from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';

import { upsertPatient } from './helpers/db';
describe('Data Loss Prevention (DLP) & Steganographic Watermark API (LGPD Art. 46 & CFP nº 001/2009)', () => {
  let authToken: string;
  let adminToken: string;
  let samplePatientId: string;

  beforeAll(async () => {

    // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

    await globalRateLimitStore.reset();
    // 1. Autenticação como psicólogo titular
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const loginData = await loginRes.json();
    authToken = loginData.accessToken;

    // 2. Autenticação como administrador
    const adminRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await adminRes.json();
    adminToken = adminData.accessToken;

    // 3. Cria paciente isolado
    samplePatientId = 'patient-dlp-dedicated-' + Date.now();
    await upsertPatient({
      id: samplePatientId,
      therapistId: 'therapist-001',
      emailBindex: 'bindex-dlp-' + Date.now(),
      cpfBindex: 'bindex-cpf-dlp-' + Date.now(),
      consentTranscriptionSigned: true,
      createdAt: new Date(),
      encryptedName: encryptField('Paciente Dedicado Teste DLP'),
      encryptedEmail: encryptField('dlp.test@terapiainfoco.com.br'),
      encryptedPhone: encryptField('11900000000')
    });
  });

  it('POST /api/dlp/evaluate deve embutir marca d\'água esteganográfica zero-width invisível no modo WATERMARK_ONLY', async () => {
    const textToCopy = 'S: Paciente relata ansiedade moderada. A: Hipótese diagnóstica de F41.1 mantida.';

    const res = await app.request('/api/dlp/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        text: textToCopy,
        patientId: samplePatientId,
        sourceContext: 'SOAP_NOTES',
        policyMode: DlpPolicyMode.WATERMARK_ONLY
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.allowed).toBe(true);
    expect(data.result.action).toBe(DlpPolicyMode.WATERMARK_ONLY);
    expect(data.result.invisibleCharsCount).toBeGreaterThan(0);
    expect(data.result.watermarkId).toBeDefined();
    expect(data.result.transformedText).toBeDefined();
  });

  it('POST /api/dlp/evaluate deve injetar disclaimer de confidencialidade no modo WATERMARK_AND_NOTICE', async () => {
    const textToCopy = 'O: Sessão realizada com foco em reestruturação cognitiva.';

    const res = await app.request('/api/dlp/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        text: textToCopy,
        patientId: samplePatientId,
        sourceContext: 'SOAP_NOTES',
        policyMode: DlpPolicyMode.WATERMARK_AND_NOTICE
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.disclaimerText).toBeDefined();
    expect(data.result.disclaimerText).toContain('CONFIDENCIAL — SIGILO PROFISSIONAL');
    expect(data.result.transformedText).toContain('CFP nº 001/2009');
  });

  it('POST /api/dlp/evaluate deve mascarar dados sensíveis no modo MASK_SENSITIVE', async () => {
    const textWithCpf = 'Paciente informou CPF 123.456.789-00 para recibo de consulta.';

    const res = await app.request('/api/dlp/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        text: textWithCpf,
        patientId: samplePatientId,
        sourceContext: 'PATIENT_PROFILE',
        policyMode: DlpPolicyMode.MASK_SENSITIVE
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.transformedText).toContain('123.***.***-00');
    expect(data.result.transformedText).not.toContain('123.456.789-00');
  });

  it('POST /api/dlp/evaluate deve bloquear exfiltração volumosa no modo BLOCK_EXFILTRATION', async () => {
    const hugeText = 'Nota clínica confidencial sobre trauma e anamnese '.repeat(90);

    const res = await app.request('/api/dlp/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        text: hugeText,
        patientId: samplePatientId,
        sourceContext: 'ANAMNESE',
        policyMode: DlpPolicyMode.BLOCK_EXFILTRATION
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.allowed).toBe(false);
    expect(data.result.rejectionReason).toContain('bloqueada pela política DLP');
  });

  it('POST /api/dlp/inspect deve identificar e extrair metadados forenses de texto com marca d\'água', async () => {
    // 1. Gera uma cópia protegida
    const evalRes = await app.request('/api/dlp/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        text: 'Nota SOAP pericial vazada externamente em canal de chat.',
        patientId: samplePatientId,
        sourceContext: 'SOAP_NOTES',
        policyMode: DlpPolicyMode.WATERMARK_ONLY
      })
    });
    const evalData = await evalRes.json();
    const watermarkedText = evalData.result.transformedText;

    // 2. Realiza perícia forense com endpoint inspect
    const inspectRes = await app.request('/api/dlp/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        suspiciousText: watermarkedText
      })
    });

    expect(inspectRes.status).toBe(200);
    const inspectData = await inspectRes.json();
    expect(inspectData.success).toBe(true);
    expect(inspectData.result.status).toBe(SteganographyInspectionStatus.GENUINE_WATERMARK);
    expect(inspectData.result.hasZeroWidthChars).toBe(true);
    expect(inspectData.result.payload.patientId).toBe(samplePatientId);
    expect(inspectData.result.sourceNotice).toBeDefined();
  });

  it('POST /api/dlp/inspect deve apontar NO_WATERMARK para texto sem esteganografia', async () => {
    const res = await app.request('/api/dlp/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        suspiciousText: 'Texto puramente limpo sem caracteres invisíveis'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.status).toBe(SteganographyInspectionStatus.NO_WATERMARK);
    expect(data.result.hasZeroWidthChars).toBe(false);
  });

  it('GET /api/dlp/overview deve retornar estatísticas agregadas e histórico de eventos', async () => {
    const res = await app.request('/api/dlp/overview', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview.totalCopiesMonitored).toBeGreaterThan(0);
    expect(data.overview.watermarksEmbedded).toBeGreaterThan(0);
    expect(data.overview.recentEvents.length).toBeGreaterThan(0);
  });

  it('PUT /api/dlp/policy deve atualizar a política global quando chamado por ADMIN', async () => {
    const res = await app.request('/api/dlp/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        policyMode: DlpPolicyMode.WATERMARK_AND_NOTICE
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.activePolicy).toBe(DlpPolicyMode.WATERMARK_AND_NOTICE);

    // Restaura para WATERMARK_ONLY
    await app.request('/api/dlp/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        policyMode: DlpPolicyMode.WATERMARK_ONLY
      })
    });
  });
});
