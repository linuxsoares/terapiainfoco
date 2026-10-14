import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { VerifiableCredentialType, DidVerificationStatus, CredentialRevocationStatus } from '@terapiainfoco/shared';

describe('Clinical DID & Verifiable Credentials REST API (RFC-001 §3.5)', () => {
  it('GET /api/did/resolve/:did deve resolver DID Document no padrão W3C DID v1.0', async () => {
    const res = await app.request('/api/did/resolve/did:terapiainfoco:crp-06-123456');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.didDocument).toBeDefined();
    expect(data.didDocument.id).toBe('did:terapiainfoco:crp-06-123456');
    expect(data.didDocument['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(data.didDocument.verificationMethod[0].controller).toBe('did:terapiainfoco:crp-06-123456');
  });

  it('GET /api/did/resolve/:did deve retornar 404 para formato de DID desconhecido', async () => {
    const res = await app.request('/api/did/resolve/did:unknown-method:abc123xyz');
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/did/credentials/issue deve emitir Verifiable Credential assinada com blind index e token JWT', async () => {
    const payload = {
      credentialType: VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL,
      patientId: 'patient-integration-test-01',
      therapistId: 'therapist-uuid-integration',
      therapistCrp: '06/998877',
      therapistName: 'Dra. Gabriela Nunes',
      clinicalSpecialty: 'Neuropsicologia',
      referralReason: 'Encaminhamento para investigação diagnóstica de TDAH em adulto',
      targetSpecialistType: 'NEUROLOGISTA',
      expirationMonths: 12
    };

    const res = await app.request('/api/did/credentials/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.credential).toBeDefined();
    expect(data.credential.id.startsWith('urn:uuid:')).toBe(true);
    expect(data.credential.type).toContain(VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL);
    expect(data.credential.proof).toBeDefined();
    expect(data.credential.credentialSubject.patientBlindIndex).toBeDefined();
    expect(data.jwtToken).toBeDefined();
    expect(data.jwtToken.startsWith('eyJ')).toBe(true);
  });

  it('POST /api/did/credentials/issue deve rejeitar requisição com campos obrigatórios ausentes', async () => {
    const res = await app.request('/api/did/credentials/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'patient-without-crp'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/did/credentials/verify deve validar credencial tanto por ID quanto por token JWT', async () => {
    // 1. Emite credencial para teste de verificação
    const issueRes = await app.request('/api/did/credentials/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialType: VerifiableCredentialType.MENTAL_HEALTH_ATTESTATION_CREDENTIAL,
        patientId: 'patient-to-verify-jwt',
        therapistId: 'therapist-uuid',
        therapistCrp: '06/445566',
        therapistName: 'Dr. Fernando Lima'
      })
    });
    const issueData = await issueRes.json();
    const credId = issueData.credential.id;
    const jwtToken = issueData.jwtToken;

    // 2. Validação por ID
    const verifyByIdRes = await app.request('/api/did/credentials/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialOrPresentationPayload: credId })
    });
    expect(verifyByIdRes.status).toBe(200);
    const verifyByIdData = await verifyByIdRes.json();
    expect(verifyByIdData.success).toBe(true);
    expect(verifyByIdData.result.valid).toBe(true);
    expect(verifyByIdData.result.status).toBe(DidVerificationStatus.VALID_VERIFIED);

    // 3. Validação por JWT
    const verifyByJwtRes = await app.request('/api/did/credentials/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialOrPresentationPayload: jwtToken })
    });
    expect(verifyByJwtRes.status).toBe(200);
    const verifyByJwtData = await verifyByJwtRes.json();
    expect(verifyByJwtData.success).toBe(true);
    expect(verifyByJwtData.result.valid).toBe(true);
    expect(verifyByJwtData.result.status).toBe(DidVerificationStatus.VALID_VERIFIED);
  });

  it('POST /api/did/credentials/revoke deve revogar formalmente credencial e refletir na verificação', async () => {
    // 1. Emite credencial
    const issueRes = await app.request('/api/did/credentials/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialType: VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL,
        patientId: 'patient-to-revoke',
        therapistId: 'therapist-uuid',
        therapistCrp: '06/112233',
        therapistName: 'Dra. Beatriz Santos'
      })
    });
    const issueData = await issueRes.json();
    const credId = issueData.credential.id;

    // 2. Revogação formal
    const revokeRes = await app.request('/api/did/credentials/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: credId,
        revocationReason: 'Interrupção antecipada do plano terapêutico com consentimento do paciente'
      })
    });
    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.success).toBe(true);
    expect(revokeData.credentialId).toBe(credId);

    // 3. Verificação pós-revogação
    const verifyRes = await app.request('/api/did/credentials/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialOrPresentationPayload: credId })
    });
    const verifyData = await verifyRes.json();
    expect(verifyData.result.valid).toBe(false);
    expect(verifyData.result.status).toBe(DidVerificationStatus.CREDENTIAL_REVOKED);
    expect(verifyData.result.revocationStatus).toBe(CredentialRevocationStatus.REVOKED);
  });

  it('GET /api/did/overview deve retornar métricas e estatísticas de governança da federação', async () => {
    const res = await app.request('/api/did/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.totalFederatedTherapists).toBeGreaterThanOrEqual(1);
    expect(data.overview.totalIssuedCredentials).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.overview.recentCredentials)).toBe(true);
  });

  it('GET /api/did/credentials/patient/:patientId deve listar credenciais emitidas para o paciente', async () => {
    const patientId = 'patient-search-test-88';

    await app.request('/api/did/credentials/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialType: VerifiableCredentialType.PSYCHOLOGICAL_REPORT_CREDENTIAL,
        patientId,
        therapistId: 'therapist-uuid',
        therapistCrp: '06/778899',
        therapistName: 'Dr. Lucas Silveira'
      })
    });

    const res = await app.request(`/api/did/credentials/patient/${patientId}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.patientId).toBe(patientId);
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.credentials[0].credentialSubject.therapistName).toBe('Dr. Lucas Silveira');
  });
});
