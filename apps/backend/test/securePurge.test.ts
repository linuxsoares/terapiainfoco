import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import {
  PurgeReason,
  PurgeMethod,
  PurgeProofVerificationStatus
} from '@terapiainfoco/shared';
import { encryptField } from '../src/services/cryptoContext';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';

describe('Expurgamento Criptográfico e Descarte Seguro de Dados API (LGPD Art. 16 & CFP nº 001/2009)', () => {
  let authToken: string;
  let eligiblePatientId: string;
  let activePatientId: string;
  let issuedSeal: string;
  let issuedCertificateId: string;

  beforeAll(async () => {

    // Rate limit de login (5/min por IP) é compartilhado entre arquivos de teste

    globalRateLimitStore.reset();
    // 1. Autenticação como psicólogo titular / admin
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

    // 2. Paciente elegível: inativo há mais de 5 anos (ex: 64 meses atrás)
    eligiblePatientId = 'patient-purge-eligible-' + Date.now();
    const fiveYearsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 5.3);

    db.patients.set(eligiblePatientId, {
      id: eligiblePatientId,
      therapistId: 'therapist-001',
      emailBindex: 'bindex-purge-eligible-' + Date.now(),
      cpfBindex: 'bindex-cpf-purge-' + Date.now(),
      consentTranscriptionSigned: true,
      createdAt: fiveYearsAgo,
      encryptedName: encryptField('Paciente Elegivel 5 Anos'),
      encryptedEmail: encryptField('purge.eligible@terapiainfoco.com.br')
    } as any);

    const recId = 'rec-purge-test-' + Date.now();
    db.clinicalRecords.set(recId, {
      id: recId,
      patientId: eligiblePatientId,
      therapistId: 'therapist-001',
      sessionDate: fiveYearsAgo,
      soapEncrypted: 'mock-encrypted-soap-to-be-destroyed',
      createdAt: fiveYearsAgo,
      updatedAt: fiveYearsAgo,
      version: 1
    } as any);

    // 3. Paciente recente: inativo há 2 anos (bloqueado para expurgo pela regra dos 5 anos)
    activePatientId = 'patient-purge-blocked-' + Date.now();
    const twoYearsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2);

    db.patients.set(activePatientId, {
      id: activePatientId,
      therapistId: 'therapist-001',
      emailBindex: 'bindex-purge-blocked-' + Date.now(),
      cpfBindex: 'bindex-cpf-blocked-' + Date.now(),
      consentTranscriptionSigned: true,
      createdAt: twoYearsAgo,
      encryptedName: encryptField('Paciente Em Guarda Legal CFP'),
      encryptedEmail: encryptField('purge.blocked@terapiainfoco.com.br')
    } as any);

    const recActiveId = 'rec-active-test-' + Date.now();
    db.clinicalRecords.set(recActiveId, {
      id: recActiveId,
      patientId: activePatientId,
      therapistId: 'therapist-001',
      sessionDate: twoYearsAgo,
      soapEncrypted: 'mock-soap-active',
      createdAt: twoYearsAgo,
      updatedAt: twoYearsAgo,
      version: 1
    } as any);
  });

  it('GET /api/purge/candidates deve listar candidatos e apontar elegibilidade correta', async () => {
    const res = await app.request('/api/purge/candidates', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.candidates)).toBe(true);

    const eligible = data.candidates.find((c: any) => c.patientId === eligiblePatientId);
    expect(eligible).toBeDefined();
    expect(eligible.isEligibleForPurge).toBe(true);

    const blocked = data.candidates.find((c: any) => c.patientId === activePatientId);
    expect(blocked).toBeDefined();
    expect(blocked.isEligibleForPurge).toBe(false);
    expect(blocked.blockingReason).toContain('5 anos');
  });

  it('POST /api/purge/execute deve bloquear expurgo de prontuário com menos de 5 anos de inatividade (HTTP 403)', async () => {
    const res = await app.request('/api/purge/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        patientId: activePatientId,
        purgeReason: PurgeReason.PATIENT_REQUEST_ART_18
      })
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('guarda compulsória de 5 anos');
  });

  it('POST /api/purge/execute deve permitir expurgo antecipado se houver ordem judicial', async () => {
    const res = await app.request('/api/purge/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        patientId: activePatientId,
        purgeReason: PurgeReason.LEGAL_DETERMINATION,
        override5YearRuleWithLegalOrder: true,
        legalOrderNumber: 'PROCESSO-JUDICIAL-2026-99882'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.certificate.certificateId).toBeDefined();
    expect(data.result.certificate.retentionPolicyCompliance).toContain('PROCESSO-JUDICIAL-2026-99882');
  });

  it('POST /api/purge/execute deve expurgar paciente elegível (>= 5 anos), destruir registros e emitir certidão', async () => {
    const res = await app.request('/api/purge/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        patientId: eligiblePatientId,
        purgeReason: PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS,
        purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.certificate).toBeDefined();

    issuedCertificateId = data.result.certificate.certificateId;
    issuedSeal = data.result.certificate.cryptographicPurgeSeal;

    expect(issuedCertificateId).toContain('PURGE-2026-CERT-');
    expect(issuedSeal.startsWith('purge_v1_')).toBe(true);
    expect(data.result.destroyedKeysCount).toBeGreaterThanOrEqual(1);

    // Verifica que o registro foi removido da base de dados em memória
    const remainingRecords = Array.from(db.clinicalRecords.values()).filter(r => r.patientId === eligiblePatientId);
    expect(remainingRecords).toHaveLength(0);
  });

  it('POST /api/purge/verify deve validar autenticidade pública da certidão via selo purge_v1_*', async () => {
    const res = await app.request('/api/purge/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purgeSealOrCertificateId: issuedSeal
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.valid).toBe(true);
    expect(data.result.status).toBe(PurgeProofVerificationStatus.PROOF_VALID_AUTHENTIC);
    expect(data.result.certificateId).toBe(issuedCertificateId);
  });

  it('POST /api/purge/verify deve retornar PROOF_NOT_FOUND para selo inexistente', async () => {
    const res = await app.request('/api/purge/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purgeSealOrCertificateId: 'purge_v1_nonexistent_fake_seal'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.valid).toBe(false);
    expect(data.result.status).toBe(PurgeProofVerificationStatus.PROOF_NOT_FOUND);
  });

  it('GET /api/purge/overview deve retornar indicadores consolidados de expurgo', async () => {
    const res = await app.request('/api/purge/overview', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview.totalPurgedPatients).toBeGreaterThanOrEqual(2);
    expect(data.overview.totalCertificatesIssued).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(data.overview.recentCertificates)).toBe(true);
  });

  it('GET /api/purge/certificate/:id deve retornar a certidão solicitada', async () => {
    const res = await app.request(`/api/purge/certificate/${issuedCertificateId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.certificate.certificateId).toBe(issuedCertificateId);
  });
});
