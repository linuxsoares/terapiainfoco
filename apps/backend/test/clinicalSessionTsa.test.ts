import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { ClinicalSessionTsaService } from '../src/services/clinicalSessionTsaService';
import {
  TimestampVerificationStatus,
  TimestampTamperType,
  TsaAuthorityType
} from '@terapiainfoco/shared';

describe('Integração de Rotas REST — Certificação Notarial de Sessão Clínica RFC 3161 ICP-Brasil', () => {
  beforeEach(() => {
    ClinicalSessionTsaService.getInstance().seedDemoData();
  });

  it('GET /api/tsa-notary/overview deve retornar KPIs regulatórios e tokens recentes da ACT ICP-Brasil', async () => {
    const res = await app.request('/api/tsa-notary/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalStampsIssued).toBeGreaterThanOrEqual(142);
    expect(data.overview.metrics.icpBrasilStampsCount).toBeGreaterThanOrEqual(142);
    expect(data.overview.tsaCertificate.authorityType).toBe(TsaAuthorityType.ICP_BRASIL_ACT);
    expect(data.overview.recentTokens.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/tsa-notary/stamp-session deve validar campos obrigatórios com erro 400', async () => {
    const res = await app.request('/api/tsa-notary/stamp-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_incomplete' })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/tsa-notary/stamp-session deve emitir carimbo do tempo oficial para uma sessão clínica', async () => {
    const payload = {
      sessionId: 'sess_integ_test_2026_001',
      patientId: 'patient_uuid_fernanda_7721',
      therapistId: 'therapist_dr_claudio_01',
      therapistCrp: 'CRP-06/123456',
      sessionStartTime: '2026-10-15T15:00:00.000Z',
      sessionEndTime: '2026-10-15T15:50:00.000Z',
      clinicalSummaryOrHash: 'sha256_soap_hash_registro_sessao_12'
    };

    const res = await app.request('/api/tsa-notary/stamp-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'therapist_claudio' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.token.sessionId).toBe(payload.sessionId);
    expect(data.token.tokenId.startsWith('tst_rfc3161_')).toBe(true);
    expect(data.token.rawTokenBase64).toBeDefined();
    expect(data.token.wormSealHash).toBeDefined();
    expect(data.token.tsaCertificate.authorityType).toBe(TsaAuthorityType.ICP_BRASIL_ACT);
  });

  it('POST /api/tsa-notary/verify-token deve verificar pericialmente a integridade do carimbo emitido', async () => {
    // 1. Emite carimbo
    const payload = {
      sessionId: 'sess_integ_verify_test',
      patientId: 'patient_verify_01',
      therapistId: 'therapist_claudio_01',
      therapistCrp: 'CRP-06/123456',
      sessionStartTime: '2026-10-15T16:00:00.000Z',
      sessionEndTime: '2026-10-15T16:50:00.000Z',
      clinicalSummaryOrHash: 'nota_soap_autentica'
    };

    const stampRes = await app.request('/api/tsa-notary/stamp-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const { token } = await stampRes.json();

    // 2. Verifica token válido
    const verifyRes = await app.request('/api/tsa-notary/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: token.tokenId,
        sessionId: payload.sessionId,
        expectedImprint: token.tstInfo.messageImprint.hashedMessage
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.result.isValid).toBe(true);
    expect(verifyData.result.status).toBe(TimestampVerificationStatus.VALID);
    expect(verifyData.result.signatureValid).toBe(true);
    expect(verifyData.result.messageImprintMatch).toBe(true);

    // 3. Testa verificação com digest divergente (detecção de fraude)
    const falseVerifyRes = await app.request('/api/tsa-notary/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: token.tokenId,
        expectedImprint: 'hash_falso_adulterado_99999999999999999999999999999999'
      })
    });

    const falseVerifyData = await falseVerifyRes.json();
    expect(falseVerifyData.result.isValid).toBe(false);
    expect(falseVerifyData.result.status).toBe(TimestampVerificationStatus.HASH_MISMATCH);
  });

  it('POST /api/tsa-notary/simulate-tampering deve detectar adulteração com precisão forense', async () => {
    const overviewRes = await app.request('/api/tsa-notary/overview');
    const { overview } = await overviewRes.json();
    const targetToken = overview.recentTokens[0];

    // Simula adulteração de data e hora (retrodatação)
    const res = await app.request('/api/tsa-notary/simulate-tampering', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: targetToken.tokenId,
        tamperType: TimestampTamperType.ALTER_TIMESTAMP
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verificationBefore.isValid).toBe(true);
    expect(data.verificationAfter.isValid).toBe(false);
    expect(data.verificationAfter.status).toBe(TimestampVerificationStatus.SIGNATURE_INVALID);
  });

  it('GET /api/tsa-notary/session/:sessionId/token deve retornar o carimbo correspondente ou 404', async () => {
    // Demo session existente
    const res = await app.request('/api/tsa-notary/session/sess_clinical_rec_001/token');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token.sessionId).toBe('sess_clinical_rec_001');

    // Sessão inexistente
    const res404 = await app.request('/api/tsa-notary/session/sess_inexistente_999/token');
    expect(res404.status).toBe(404);
  });

  it('GET /api/tsa-notary/tsa-info deve retornar dados do certificado ACT ICP-Brasil e OIDs suportados', async () => {
    const res = await app.request('/api/tsa-notary/tsa-info');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.tsaCertificate.commonName).toContain('Observatório Nacional');
    expect(data.supportedOids.length).toBeGreaterThanOrEqual(3);
  });
});
