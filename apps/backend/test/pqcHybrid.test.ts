import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  PqcSecurityLevel,
  PqcKemScheme,
  PqcDsaScheme,
  PqcClinicalTargetType,
  PqcQuantumAttackType,
  PqcDefenseOutcome
} from '@terapiainfoco/shared';

describe('Rotas de Criptografia Pós-Quântica Híbrida (/api/pqc-hybrid - NIST FIPS 203 & 204)', () => {
  it('GET /api/pqc-hybrid/overview deve retornar status 200 com inventário e métricas PQC', async () => {
    const res = await app.request('/api/pqc-hybrid/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics.totalProtectedRecords).toBeGreaterThan(0);
    expect(body.overview.activeHybridKeyPair).toBeDefined();
    expect(body.overview.activeHybridKeyPair.kemScheme).toBe(PqcKemScheme.ML_KEM_768);
    expect(body.overview.systemHealth).toBe('QUANTUM_SAFE');
    // Chave privada não deve vazar na visão geral
    expect(body.overview.activeHybridKeyPair.privateKey).toBeUndefined();
  });

  it('POST /api/pqc-hybrid/generate-keypair deve gerar novo par de chaves NIST Nível 5 com sucesso', async () => {
    const res = await app.request('/api/pqc-hybrid/generate-keypair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: 'Chave Pentest PQC Nível 5 (Kyber-1024)',
        securityLevel: PqcSecurityLevel.NIST_LEVEL_5,
        kemScheme: PqcKemScheme.ML_KEM_1024,
        dsaScheme: PqcDsaScheme.ML_DSA_87
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.keyPair.keyId).toBeDefined();
    expect(body.keyPair.kemScheme).toBe(PqcKemScheme.ML_KEM_1024);
    expect(body.keyPair.dsaScheme).toBe(PqcDsaScheme.ML_DSA_87);
    expect(body.keyPair.privateKey).toBeUndefined();
  });

  it('POST /api/pqc-hybrid/generate-keypair deve rejeitar requisição sem alias', async () => {
    const res = await app.request('/api/pqc-hybrid/generate-keypair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST /api/pqc-hybrid/encapsulate deve cifrar registro clínico com envelope híbrido PQC', async () => {
    // Obter chave ativa
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const activeKeyId = overviewBody.overview.activeHybridKeyPair.keyId;

    const res = await app.request('/api/pqc-hybrid/encapsulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: activeKeyId,
        targetType: PqcClinicalTargetType.SOAP_EVOLUTION_RECORD,
        title: 'Prontuário Confidencial com Proteção Quântica',
        patientBlindIndex: 'pt_blind_quantum_001',
        plaintextClinicalData: 'Paciente evolui favoravelmente com psicoterapia baseada em evidências.'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.protectedRecord.id).toStartWith('pqc_rec_');
    expect(body.protectedRecord.ciphertextBase64).toBeDefined();
    expect(body.protectedRecord.quantumSafe).toBe(true);
    expect(body.protectedRecord.proofSeal.sealToken).toStartWith('pqc_proof_v1_');
  });

  it('POST /api/pqc-hybrid/decapsulate deve decifrar prontuário e verificar assinatura dual', async () => {
    // Obter registro existente
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const existingRecord = overviewBody.overview.protectedRecords[0];

    const res = await app.request('/api/pqc-hybrid/decapsulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: existingRecord.id,
        keyId: existingRecord.encapsulation.keyId
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.decryptedPlaintext).toBeDefined();
    expect(body.verifiedSignature).toBe(true);
  });

  it('POST /api/pqc-hybrid/sign e POST /api/pqc-hybrid/verify-signature devem emitir e validar assinatura dual', async () => {
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const activeKeyId = overviewBody.overview.activeHybridKeyPair.keyId;

    const docContent = 'Termo de Consentimento Livre e Esclarecido (TCLE) com validade jurídica digital.';

    // Assinar
    const signRes = await app.request('/api/pqc-hybrid/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: activeKeyId,
        documentContent: docContent
      })
    });

    expect(signRes.status).toBe(200);
    const signBody = await signRes.json();
    expect(signBody.success).toBe(true);
    expect(signBody.signatureResult.classicalSignatureHex).toBeDefined();
    expect(signBody.signatureResult.pqSignatureBase64).toBeDefined();

    // Verificar
    const verifyRes = await app.request('/api/pqc-hybrid/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: activeKeyId,
        documentContent: docContent,
        classicalSignatureHex: signBody.signatureResult.classicalSignatureHex,
        pqSignatureBase64: signBody.signatureResult.pqSignatureBase64
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.verification.isValid).toBe(true);
    expect(verifyBody.verification.classicalSignatureValid).toBe(true);
    expect(verifyBody.verification.pqSignatureValid).toBe(true);
    expect(verifyBody.verification.hybridValid).toBe(true);
  });

  it('POST /api/pqc-hybrid/verify-signature deve rejeitar assinatura se o documento for modificado', async () => {
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const activeKeyId = overviewBody.overview.activeHybridKeyPair.keyId;

    const signRes = await app.request('/api/pqc-hybrid/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: activeKeyId,
        documentContent: 'Texto original e autêntico.'
      })
    });
    const signBody = await signRes.json();

    const verifyRes = await app.request('/api/pqc-hybrid/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: activeKeyId,
        documentContent: 'Texto fraudado e alterado retroativamente.',
        classicalSignatureHex: signBody.signatureResult.classicalSignatureHex,
        pqSignatureBase64: signBody.signatureResult.pqSignatureBase64
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.verification.isValid).toBe(false);
  });

  it('POST /api/pqc-hybrid/simulate-attack deve simular pentest de Shor e SNDL com proteção', async () => {
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const targetRecordId = overviewBody.overview.protectedRecords[0].id;

    const res = await app.request('/api/pqc-hybrid/simulate-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: targetRecordId,
        attackType: PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.simulation.attackType).toBe(PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG);
    expect(body.simulation.classicalCracked).toBe(true);
    expect(body.simulation.postQuantumCracked).toBe(false);
    expect(body.simulation.dataExfiltrated).toBe(false);
    expect(body.simulation.outcome).toBe(PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE);
  });

  it('POST /api/pqc-hybrid/verify-seal deve validar pericialmente selo probatório WORM autêntico', async () => {
    const overviewRes = await app.request('/api/pqc-hybrid/overview');
    const overviewBody = await overviewRes.json();
    const token = overviewBody.overview.protectedRecords[0].proofSeal.sealToken;

    const res = await app.request('/api/pqc-hybrid/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: token
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isValid).toBe(true);
    expect(body.seal).toBeDefined();
    expect(body.message).toContain('autêntico e inalterado');
  });

  it('POST /api/pqc-hybrid/verify-seal deve rejeitar token adulterado', async () => {
    const res = await app.request('/api/pqc-hybrid/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: 'pqc_proof_v1_eyJmb3JnZWQiOnRydWV9'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isValid).toBe(false);
  });
});
