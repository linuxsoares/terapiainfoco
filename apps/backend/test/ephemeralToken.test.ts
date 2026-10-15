import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/index';
import {
  EphemeralTokenStatus,
  EphemeralTokenTarget,
  RevocationReason,
  EphemeralTokenVerificationVerdict
} from '@terapiainfoco/shared';

describe('Ephemeral Teleconsult Tokens API Integration (/api/ephemeral-tokens)', () => {
  let createdTokenString: string;
  let createdTokenId: string;
  let proofSealToken: string;

  it('GET /api/ephemeral-tokens/overview - deve retornar visão consolidada com métricas e tokens', async () => {
    const res = await app.request('/api/ephemeral-tokens/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview.metrics.totalTokensIssued).toBeGreaterThan(0);
    expect(data.overview.activeTokens.length).toBeGreaterThan(0);
    expect(data.overview.defaultTtlMinutes).toBe(60);
  });

  it('POST /api/ephemeral-tokens/issue - deve validar parâmetros obrigatórios', async () => {
    const res = await app.request('/api/ephemeral-tokens/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: 'paciente_incompleto' }) // Faltam therapistCrp e roomId
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/ephemeral-tokens/issue - deve emitir credencial efêmera com magicLink e QR Code', async () => {
    const res = await app.request('/api/ephemeral-tokens/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'paciente_juliana_alves_901',
        therapistCrp: 'CRP-06/889900',
        roomId: 'sala_telepsi_juliana_room',
        target: EphemeralTokenTarget.TELECONSULTATION_ROOM,
        ttlMinutes: 45,
        singleUse: true
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token.tokenId).toStartWith('eph_');
    expect(data.magicLink).toContain(encodeURIComponent(data.token.tokenString));
    expect(data.qrCodeDataUri).toStartWith('data:image/png;base64,');
    expect(data.token.status).toBe(EphemeralTokenStatus.ACTIVE_PENDING);

    createdTokenString = data.token.tokenString;
    createdTokenId = data.token.tokenId;
    proofSealToken = data.token.proofSeal.sealToken;
  });

  it('POST /api/ephemeral-tokens/consume - deve autorizar ingresso e consumir token tempestivo', async () => {
    const res = await app.request('/api/ephemeral-tokens/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenString: createdTokenString,
        roomId: 'sala_telepsi_juliana_room'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.granted).toBe(true);
    expect(data.verdict).toBe(EphemeralTokenVerificationVerdict.VALID_GRANTED);
    expect(data.record.tokenId).toBe(createdTokenId);
  });

  it('POST /api/ephemeral-tokens/consume - deve bloquear reuso de token de uso único (TOKEN_ALREADY_CONSUMED)', async () => {
    const res = await app.request('/api/ephemeral-tokens/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenString: createdTokenString,
        roomId: 'sala_telepsi_juliana_room'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.verdict).toBe(EphemeralTokenVerificationVerdict.TOKEN_ALREADY_CONSUMED);
  });

  it('POST /api/ephemeral-tokens/revoke - deve revogar deliberadamente token com registro WORM', async () => {
    // Emite novo token para revogar
    const issueRes = await app.request('/api/ephemeral-tokens/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'paciente_para_revogar_321',
        therapistCrp: 'CRP-06/889900',
        roomId: 'sala_revogacao_imediata'
      })
    });
    const issueData = await issueRes.json();

    const revokeRes = await app.request('/api/ephemeral-tokens/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: issueData.token.tokenId,
        reason: RevocationReason.THERAPIST_FORCE_KILL
      })
    });

    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.success).toBe(true);
    expect(revokeData.token.status).toBe(EphemeralTokenStatus.REVOKED_BY_THERAPIST);
    expect(revokeData.token.revocationReason).toBe(RevocationReason.THERAPIST_FORCE_KILL);
  });

  it('POST /api/ephemeral-tokens/simulate-intrusion - deve simular e bloquear intrusão com token expirado', async () => {
    const res = await app.request('/api/ephemeral-tokens/simulate-intrusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'EXPIRED_TOKEN' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(true);
    expect(data.verdict).toBe(EphemeralTokenVerificationVerdict.TOKEN_EXPIRED);
  });

  it('POST /api/ephemeral-tokens/simulate-intrusion - deve simular e bloquear token com assinatura forjada', async () => {
    const res = await app.request('/api/ephemeral-tokens/simulate-intrusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'TAMPERED_SIGNATURE' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(true);
    expect(data.verdict).toBe(EphemeralTokenVerificationVerdict.SIGNATURE_INVALID);
  });

  it('POST /api/ephemeral-tokens/update-policy - deve atualizar TTL padrão do enclave', async () => {
    const res = await app.request('/api/ephemeral-tokens/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultTtlMinutes: 90,
        allowConcurrentAccess: false
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.defaultTtlMinutes).toBe(90);
    expect(data.allowConcurrentAccess).toBe(false);
  });

  it('POST /api/ephemeral-tokens/verify-seal - deve atestar fé pública em selo WORM autêntico', async () => {
    const res = await app.request('/api/ephemeral-tokens/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: proofSealToken })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.isValid).toBe(true);
    expect(data.message).toContain('autêntico e íntegro');
  });
});
