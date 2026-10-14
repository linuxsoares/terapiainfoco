import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { NotaryStatus, NotaryVerificationStatus } from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';

describe('Cartório Notarial Digital & Auditoria Forense Zero-Knowledge API (CFP nº 001/2009 & LGPD Art. 18)', () => {
  let authToken: string;
  let samplePatientId: string;
  let sampleRecordId: string;
  let sealedToken: string;

  beforeAll(async () => {
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

    // 2. Cria paciente e prontuário dedicados para isolamento total do teste
    samplePatientId = 'patient-notary-test-' + Date.now();
    db.patients.set(samplePatientId, {
      id: samplePatientId,
      therapistId: 'therapist-001',
      emailBindex: 'bindex-notary-' + Date.now(),
      cpfBindex: 'bindex-cpf-notary-' + Date.now(),
      consentTranscriptionSigned: true,
      createdAt: new Date(),
      encryptedName: encryptField('Paciente Dedicado Teste Notarial'),
      encryptedEmail: encryptField('notary.test@terapiainfoco.com.br')
    } as any);

    sampleRecordId = 'record-notary-test-' + Date.now();
    db.clinicalRecords.set(sampleRecordId, {
      id: sampleRecordId,
      patientId: samplePatientId,
      therapistId: 'therapist-001',
      sessionDate: new Date(),
      soapEncrypted: 'mock-encrypted-soap',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    } as any);
  });

  it('POST /api/notary/seal deve notarizar formalmente um prontuário clínico gerando selo digital', async () => {
    const res = await app.request('/api/notary/seal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        recordId: sampleRecordId,
        patientId: samplePatientId,
        therapistId: 'therapist-001',
        therapistCrp: '06/142980-SP'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.block).toBeDefined();
    expect(data.block.recordId).toBe(sampleRecordId);
    expect(data.block.patientId).toBe(samplePatientId);
    expect(data.block.digitalNotarySeal.startsWith('notary_v1_')).toBe(true);
    expect(data.block.recordBlindIndex.startsWith('bidx_rec_')).toBe(true);
    expect(data.block.status).toBe(NotaryStatus.NOTARIZED);

    sealedToken = data.block.digitalNotarySeal;
  });

  it('POST /api/notary/verify deve periciar token notarial público com fé pública (Zero-Knowledge)', async () => {
    const res = await app.request('/api/notary/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sealTokenOrBlindIndex: sealedToken
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.valid).toBe(true);
    expect(data.result.status).toBe(NotaryVerificationStatus.VALID_GENUINE);
    expect(data.result.blockDetails).toBeDefined();
    expect(data.result.blockDetails.recordId).toBe(sampleRecordId);
  });

  it('POST /api/notary/verify deve retornar NOT_FOUND para token ou blind index inexistente', async () => {
    const res = await app.request('/api/notary/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sealTokenOrBlindIndex: 'bidx_rec_non_existent_hash_99999999'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.valid).toBe(false);
    expect(data.result.status).toBe(NotaryVerificationStatus.NOT_FOUND);
  });

  it('GET /api/notary/patient/:patientId deve listar histórico e validação de cadeia notarial', async () => {
    const res = await app.request(`/api/notary/patient/${samplePatientId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocks.length).toBeGreaterThan(0);
    expect(data.chainVerification.valid).toBe(true);
    expect(data.chainVerification.status).toBe(NotaryVerificationStatus.VALID_GENUINE);
  });

  it('POST /api/notary/certificate deve emitir certidão notarial forense de autenticidade', async () => {
    const res = await app.request('/api/notary/certificate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        recordId: sampleRecordId,
        patientId: samplePatientId
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.certificate).toBeDefined();
    expect(data.certificate.certificateId.startsWith('cert_notary_')).toBe(true);
    expect(data.certificate.cfpComplianceAssertion).toContain('Resolução CFP nº 001/2009');
    expect(data.certificate.lgpdComplianceAssertion).toContain('LGPD Art. 18');
    expect(data.certificate.verifierUrl).toContain('validar?notary=');
  });

  it('GET /api/notary/overview deve retornar métricas consolidadas do cartório digital', async () => {
    const res = await app.request('/api/notary/overview', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview.totalNotarizedRecords).toBeGreaterThan(0);
    expect(data.overview.integrityPercentage).toBeGreaterThanOrEqual(90);
    expect(data.overview.recentNotaryBlocks.length).toBeGreaterThan(0);
  });
});
