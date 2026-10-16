import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { AuthService } from '../src/services/authService';
import { PatientService } from '../src/services/patientService';
import {
  AuditAction,
  DiagnosticUrgencyLevel,
  PortabilityKdfAlgorithm
} from '@terapiainfoco/shared';

describe('Módulo de Exportação Segura e Portabilidade Consolidada em Pacote .enc (RFC-001 §3.3, §4.4 & LGPD Art. 18)', () => {
  let therapistToken: string;
  let secretaryToken: string;
  let patientId: string;

  beforeEach(async () => {
    db.clear();

    const authService = new AuthService();
    const loginRes = await authService.login({
      email: 'psicologo@terapiainfoco.com.br',
      password: 'Senha@123456'
    });
    therapistToken = loginRes.accessToken!;

    const secRes = await authService.login({
      email: 'recepcao@terapiainfoco.com.br',
      password: 'Senha@123456'
    });
    secretaryToken = secRes.accessToken!;

    const patient = PatientService.createPatient(
      'therapist-001',
      {
        name: 'Helena Meirelles',
        email: 'helena.meirelles@email.com',
        cpf: '456.789.123-00',
        phone: '(11) 99123-4567',
        consentTranscriptionSigned: true
      },
      { actorId: '00000000-0000-0000-0000-000000000001', ipAddress: '127.0.0.1' }
    );
    patientId = patient.id;
  });

  it('1. deve gerar pacote .enc com Argon2id + AES-256-GCM consolidando prontuário, recibos e encaminhamentos', async () => {
    // Adiciona encaminhamento psiquiátrico para testar consolidação
    await app.request('/api/psychiatric-referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        urgencyLevel: DiagnosticUrgencyLevel.ROUTINE,
        reasonForReferral: 'Avaliação psiquiátrica colaborativa de suporte.',
        clinicalHypothesesCid11: ['6B00 - Transtorno de Ansiedade Generalizada'],
        currentMedications: []
      })
    });

    const res = await app.request('/api/portability-vault/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        holderPassphrase: 'SenhaTitularPortabilidade#2026',
        kdfAlgorithm: PortabilityKdfAlgorithm.ARGON2ID,
        requestReason: 'Portabilidade integral LGPD Art. 18, V'
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fileName.endsWith('.enc')).toBe(true);
    expect(body.vaultFile.fileHeader).toBe('TERAPIAINFOCO-PORTABILITY-VAULT-V2');
    expect(body.vaultFile.kdfAlgorithm).toBe(PortabilityKdfAlgorithm.ARGON2ID);
    expect(body.vaultFile.sectionDigests).toHaveLength(11);
    expect(body.merkleRootSha256).toHaveLength(64);
    expect(body.notarySeal.sealToken.startsWith('port_enc_seal_v1_')).toBe(true);

    const auditEntry = db.auditLogs.find(
      (l) => l.action === AuditAction.PORTABILITY_ENC_VAULT_GENERATED
    );
    expect(auditEntry).toBeDefined();
  });

  it('2. deve verificar a integridade criptográfica do pacote .enc e validar a senha do titular', async () => {
    const genRes = await app.request('/api/portability-vault/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        holderPassphrase: 'SenhaTitularValida#2026'
      })
    });
    const { vaultFile } = await genRes.json();

    const verifyRes = await app.request('/api/portability-vault/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        vaultFile,
        holderPassphrase: 'SenhaTitularValida#2026'
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.verification.isValid).toBe(true);
    expect(verifyBody.verification.merkleRootMatch).toBe(true);
    expect(verifyBody.verification.notarySealValid).toBe(true);
    expect(verifyBody.verification.passphraseVerified).toBe(true);
  });

  it('3. deve decifrar o pacote .enc mediante a senha do titular e rejeitar senha incorreta', async () => {
    const genRes = await app.request('/api/portability-vault/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        holderPassphrase: 'ChaveMestreTitular#2026'
      })
    });
    const { vaultFile } = await genRes.json();

    const decRes = await app.request('/api/portability-vault/decrypt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        vaultFile,
        holderPassphrase: 'ChaveMestreTitular#2026'
      })
    });

    expect(decRes.status).toBe(200);
    const decBody = await decRes.json();
    expect(decBody.success).toBe(true);
    expect(decBody.payload.patientDemographics.name).toBe('Helena Meirelles');
    expect(decBody.payload.merkleRootSha256).toBe(vaultFile.merkleRootSha256);

    // Tentativa com senha incorreta -> 400
    const badRes = await app.request('/api/portability-vault/decrypt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        vaultFile,
        holderPassphrase: 'SenhaIncorreta#9999'
      })
    });
    expect(badRes.status).toBe(400);
  });

  it('4. deve listar o histórico de pacotes .enc gerados para o paciente e bloquear secretária (RBAC 403)', async () => {
    await app.request('/api/portability-vault/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        patientId,
        holderPassphrase: 'SenhaHistorico#2026'
      })
    });

    const histRes = await app.request(
      `/api/portability-vault/patients/${patientId}/history`,
      {
        headers: { Authorization: `Bearer ${therapistToken}` }
      }
    );
    expect(histRes.status).toBe(200);
    const histBody = await histRes.json();
    expect(histBody.success).toBe(true);
    expect(histBody.total).toBeGreaterThanOrEqual(1);

    // Secretária bloqueada por RBAC (HTTP 403)
    const secRes = await app.request('/api/portability-vault/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretaryToken}`
      },
      body: JSON.stringify({
        patientId,
        holderPassphrase: 'SenhaHistorico#2026'
      })
    });
    expect(secRes.status).toBe(403);
  });
});
