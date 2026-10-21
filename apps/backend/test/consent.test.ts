import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import {
  ConsentScope,
  ConsentStatus,
  ConsentLegalBasis
} from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';

import { upsertPatient } from './helpers/db';
describe('Granular Patient Consent & Smart Revocation API (LGPD Art. 7/8/9/11/18 & CFP 006/2019)', () => {
  let authToken: string;
  let samplePatientId: string;
  let sampleAppointmentId: string;
  let generatedToken: string;

  beforeAll(async () => {

    // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

    await globalRateLimitStore.reset();
    // Autentica como psicólogo titular padrão
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

    // Cria um paciente e agendamento dedicados para isolamento total do teste
    samplePatientId = 'patient-consent-dedicated-' + Date.now();
    await upsertPatient({
      id: samplePatientId,
      therapistId: 'therapist-001',
      emailBindex: 'bindex-consent-' + Date.now(),
      cpfBindex: 'bindex-cpf-consent-' + Date.now(),
      consentTranscriptionSigned: true,
      consentSignedAt: new Date(),
      createdAt: new Date(),
      encryptedName: encryptField('Paciente Dedicado Teste Consentimento'),
      encryptedEmail: encryptField('consent.test@terapiainfoco.com.br'),
      encryptedPhone: encryptField('(11) 98888-7777')
    } as any);

    sampleAppointmentId = 'appointment-consent-dedicated-' + Date.now();
    db.appointments.set(sampleAppointmentId, {
      id: sampleAppointmentId,
      therapistId: 'therapist-001',
      patientId: samplePatientId,
      scheduledAt: new Date(),
      durationMinutes: 50,
      status: 'CONFIRMADA' as any,
      meetLink: 'https://meet.google.com/consent-test'
    } as any);
  });

  it('GET /api/consent/patient/:patientId deve retornar o ledger de consentimento do paciente com 5 escopos', async () => {
    const res = await app.request(`/api/consent/patient/${samplePatientId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.ledger).toBeDefined();
    expect(data.ledger.patientId).toBe(samplePatientId);
    expect(data.ledger.preferences[ConsentScope.AI_CLINICAL_SYNTHESIS]).toBeDefined();
    expect(data.ledger.preferences[ConsentScope.TELECONSULTATION_AUDIO_RECORDING]).toBeDefined();
    expect(data.ledger.preferences[ConsentScope.ANONYMIZED_RESEARCH]).toBeDefined();
    expect(data.ledger.preferences[ConsentScope.INTERPROFESSIONAL_SHARING]).toBeDefined();
    expect(data.ledger.preferences[ConsentScope.COMMUNICATION_REMINDERS]).toBeDefined();
  });

  it('POST /api/consent/grant deve registrar concessão granular com recibo canônico WORM e token tcle_v1_', async () => {
    const res = await app.request('/api/consent/grant', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientId: samplePatientId,
        scopes: [
          {
            scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
            granted: true
          },
          {
            scope: ConsentScope.TELECONSULTATION_AUDIO_RECORDING,
            granted: true
          }
        ],
        notes: 'Consentimento confirmado presencialmente na sessão de acolhimento'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.newReceipts).toHaveLength(2);

    const firstReceipt = data.newReceipts[0];
    expect(firstReceipt.receiptHash).toBeString();
    expect(firstReceipt.receiptHash).toHaveLength(64);
    expect(firstReceipt.verificationToken.startsWith('tcle_v1_')).toBeTrue();
    expect(firstReceipt.action).toBe('GRANT');
    expect(firstReceipt.status).toBe(ConsentStatus.GRANTED);

    generatedToken = firstReceipt.verificationToken;
  });

  it('POST /api/consent/revoke deve executar Smart Revocation com justificativa e alterar status para REVOKED', async () => {
    const res = await app.request('/api/consent/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientId: samplePatientId,
        scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
        reason: 'Paciente solicitou interrupção de processamento por IA devido a preferência pessoal'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.ledger.preferences[ConsentScope.AI_CLINICAL_SYNTHESIS].status).toBe(ConsentStatus.REVOKED);
    expect(data.ledger.preferences[ConsentScope.AI_CLINICAL_SYNTHESIS].revocationReason).toContain('interrupção de processamento por IA');

    const revokeReceipt = data.newReceipts.find(
      (r: any) => r.scope === ConsentScope.AI_CLINICAL_SYNTHESIS && r.action === 'REVOKE'
    );
    expect(revokeReceipt).toBeDefined();
    expect(revokeReceipt.status).toBe(ConsentStatus.REVOKED);
    expect(revokeReceipt.verificationToken.startsWith('tcle_v1_')).toBeTrue();

    // Atualiza token para testar verificação pública da revogação
    generatedToken = revokeReceipt.verificationToken;
  });

  it('POST /api/consent/enforce deve bloquear tratamento e fundamentar na LGPD quando o escopo foi revogado', async () => {
    const res = await app.request('/api/consent/enforce', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        patientId: samplePatientId,
        requestedScope: ConsentScope.AI_CLINICAL_SYNTHESIS
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.result.permitted).toBeFalse();
    expect(data.result.status).toBe(ConsentStatus.REVOKED);
    expect(data.result.reason).toContain('LGPD Art. 8º, §5º');
    expect(data.result.reason).toContain('interrupção de processamento por IA');
  });

  it('GET /api/consent/verify/:token deve validar publicamente a autenticidade e integridade do recibo via token tcle_v1_', async () => {
    const res = await app.request(`/api/consent/verify/${generatedToken}`, {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.valid).toBeTrue();
    expect(data.receipt).toBeDefined();
    expect(data.receipt.verificationToken).toBe(generatedToken);
    expect(data.patientNameMasked).toBeDefined();
    expect(data.message).toContain('válido');
  });

  it('GET /api/consent/overview deve retornar métricas globais e histórico para auditoria DPO', async () => {
    const res = await app.request(`/api/consent/overview?patientId=${samplePatientId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTrue();
    expect(data.overview).toBeDefined();
    expect(data.overview.totalPatientsWithConsent).toBeGreaterThanOrEqual(1);
    expect(data.overview.revocationsCount).toBeGreaterThanOrEqual(1);
    expect(data.overview.blockedProcessingsCount).toBeGreaterThanOrEqual(1);
    expect(data.overview.termVersionActive).toBe('v2.1 (LGPD/CFP-2026)');
    expect(data.recentReceipts.length).toBeGreaterThanOrEqual(1);
    expect(data.patientLedger).toBeDefined();
  });

  it('POST /api/transcriptions/generate-soap deve falhar e bloquear processamento por IA quando AI_CLINICAL_SYNTHESIS foi revogado', async () => {
    const res = await app.request('/api/transcriptions/generate-soap', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appointmentId: sampleAppointmentId,
        utterances: [
          { speaker: 'PACIENTE', time: '00:01', text: 'Estou sentindo muita ansiedade ultimamente.' },
          { speaker: 'TERAPEUTA', time: '00:05', text: 'Vamos explorar quais gatilhos você tem percebido.' }
        ]
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBeFalse();
    expect(data.error).toContain('Tratamento bloqueado');
    expect(data.error).toContain('LGPD Art. 8º, §5º');
  });
});
