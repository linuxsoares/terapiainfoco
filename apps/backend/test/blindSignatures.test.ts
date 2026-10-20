import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  BlindSignatureScheme,
  BlindSignaturePurpose,
  BlindBallotDecision
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Blind Signatures & Chaumian Protocol API Integration (/api/blind-signatures)', () => {
  it('GET /api/blind-signatures/overview - deve retornar visão consolidada com chaves, urna e métricas', async () => {
    const res = await adminRequest('/api/blind-signatures/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics.totalBlindedTokens).toBeGreaterThanOrEqual(2);
    expect(body.overview.activeAuthorityKey).toBeDefined();
    expect(body.overview.recentBallots.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/blind-signatures/generate-authority-key - deve emitir novo par de chaves da autoridade', async () => {
    const payload = {
      scheme: BlindSignatureScheme.RSA_BLIND_2048,
      authorityName: 'Comissão Especial de Bioética do CFP',
      authorityRole: 'AUTORIDADE_EMISSORA_COLEGIADO'
    };

    const res = await adminRequest('/api/blind-signatures/generate-authority-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.publicKey.keyId).toBeDefined();
    expect(body.publicKey.authorityName).toBe('Comissão Especial de Bioética do CFP');
    expect(body.publicKey.modulusHex).toBeDefined();
  });

  it('POST /api/blind-signatures/blind - deve validar payload obrigatório', async () => {
    const res = await adminRequest('/api/blind-signatures/blind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('Fluxo Completo de Voto Ético Anônimo: Blind -> Sign-Blind -> Unblind -> Redeem-or-Vote -> Verify', async () => {
    // 0. Obter chave ativa
    const overviewRes = await adminRequest('/api/blind-signatures/overview');
    const overviewBody = await overviewRes.json();
    const authorityKeyId = overviewBody.overview.activeAuthorityKey.keyId;

    const voteMessage = `VOTO_CFP_TEST:${Date.now()}:DECISAO_FAVORAVEL`;
    const purpose = BlindSignaturePurpose.ETHICAL_COMMITTEE_BALLOT;

    // 1. Cegamento no Cliente
    const blindRes = await adminRequest('/api/blind-signatures/blind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalMessage: voteMessage,
        purpose,
        authorityKeyId
      })
    });
    expect(blindRes.status).toBe(200);
    const blindBody = await blindRes.json();
    expect(blindBody.success).toBe(true);
    const { blindedMessage } = blindBody;

    // 2. Assinatura Cega pela Autoridade
    const signRes = await adminRequest('/api/blind-signatures/sign-blind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blindedMessageHex: blindedMessage.blindedMessageHex,
        authorityKeyId,
        purpose
      })
    });
    expect(signRes.status).toBe(200);
    const signBody = await signRes.json();
    expect(signBody.success).toBe(true);
    const { signedResponse } = signBody;

    // 3. Descegamento pelo Cliente
    const unblindRes = await adminRequest('/api/blind-signatures/unblind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blindSignatureHex: signedResponse.blindSignatureHex,
        blindingFactorHex: blindedMessage.blindingFactorHex,
        originalMessage: voteMessage,
        authorityKeyId,
        purpose
      })
    });
    expect(unblindRes.status).toBe(200);
    const unblindBody = await unblindRes.json();
    expect(unblindBody.success).toBe(true);
    const { unblindedToken } = unblindBody;
    expect(unblindedToken.nullifierHash).toBeDefined();

    // 4. Apuração Anônima na Urna Ética (Resgate)
    const redeemRes = await adminRequest('/api/blind-signatures/redeem-or-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unblindedToken,
        ballotCaseNumber: 'PROCESSO-DISCIPLINAR-CFP-2026-TEST',
        ballotCaseTitle: 'Caso Teste de Integridade Chaumiana',
        decision: BlindBallotDecision.FAVORABLE_COMPLIANT
      })
    });
    expect(redeemRes.status).toBe(200);
    const redeemBody = await redeemRes.json();
    expect(redeemBody.success).toBe(true);
    expect(redeemBody.redemption.nullifierHash).toBe(unblindedToken.nullifierHash);

    // 5. Tentativa de Double-Spend com o mesmo token (deve ser barrado imediatamente)
    const doubleSpendRes = await adminRequest('/api/blind-signatures/redeem-or-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unblindedToken,
        ballotCaseNumber: 'PROCESSO-DISCIPLINAR-CFP-2026-TEST',
        decision: BlindBallotDecision.UNFAVORABLE_SANCTION
      })
    });
    expect(doubleSpendRes.status).toBe(400);
    const doubleSpendBody = await doubleSpendRes.json();
    expect(doubleSpendBody.success).toBe(false);
    expect(doubleSpendBody.message).toContain('Double-Spending Blocked');

    // 6. Verificação Universal de Fé Pública
    const verifyRes = await adminRequest('/api/blind-signatures/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalMessage: voteMessage,
        unblindedSignatureHex: unblindedToken.unblindedSignatureHex,
        authorityKeyId,
        purpose
      })
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.verification.mathematicalProofValid).toBe(true);
    expect(verifyBody.verification.doubleSpendDetected).toBe(true); // Já resgatado!

    // 7. Simulação de Double-Spend Pentest Endpoint
    const simRes = await adminRequest('/api/blind-signatures/simulate-double-spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unblindedToken
      })
    });
    expect(simRes.status).toBe(200);
    const simBody = await simRes.json();
    expect(simBody.success).toBe(true);
    expect(simBody.blocked).toBe(true);

    // 8. Validação de Selo Probatório WORM
    const sealRes = await adminRequest('/api/blind-signatures/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: redeemBody.redemption.proofSeal.sealToken
      })
    });
    expect(sealRes.status).toBe(200);
    const sealBody = await sealRes.json();
    expect(sealBody.success).toBe(true);
    expect(sealBody.isValid).toBe(true);
  });
});
