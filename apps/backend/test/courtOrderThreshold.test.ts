import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { CustodianRole, LegalJustificationType, CourtOrderVaultStatus } from '@terapiainfoco/shared';

describe('Court Order Threshold Cryptography & Shamir Quorum REST API (/api/court-order-threshold)', () => {
  it('GET /api/court-order-threshold/overview deve retornar telemetria e cofres judiciais ativos', async () => {
    const res = await app.request('/api/court-order-threshold/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics.totalVaultsCreated).toBeGreaterThanOrEqual(2);
    expect(body.overview.activeVaults.length).toBeGreaterThanOrEqual(2);
    expect(body.overview.defaultThreshold).toBe(3);
    expect(body.overview.defaultTotalShares).toBe(5);
  });

  it('POST /api/court-order-threshold/create-vault deve rejeitar requisição sem parâmetros obrigatórios', async () => {
    const res = await app.request('/api/court-order-threshold/create-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'paciente_123'
        // Faltam legalCaseNumber e secretRecordText
      })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('Parâmetros obrigatórios ausentes');
  });

  it('POST /api/court-order-threshold/create-vault deve criar cofre judicial, cifrar prontuário e gerar cotas de Shamir', async () => {
    const payload = {
      patientId: 'paciente_camila_nogueira_789',
      patientMaskedName: 'C*** N*** (Ordem Judicial)',
      legalCaseNumber: '0008912-34.2026.8.26.0100',
      legalJustification: LegalJustificationType.COURT_ORDER_SUBPOENA,
      thresholdRequired: 3,
      totalShares: 5,
      secretRecordText: 'RELATÓRIO CONFIDENCIAL DA PACIENTE CAMILA NOGUEIRA: Atendimento em 10/10/2026. Laudo solicitado pela 3ª Vara de Família.',
      custodians: [
        { role: CustodianRole.LEAD_PSYCHOLOGIST, name: 'Dra. Daniela Silva' },
        { role: CustodianRole.DPO_OFFICER, name: 'Carlos Mendes' },
        { role: CustodianRole.ETHICS_COMMITTEE_CHAIR, name: 'Dra. Beatriz Santos' },
        { role: CustodianRole.LEGAL_COUNSEL, name: 'Dr. Roberto Prado' },
        { role: CustodianRole.JUDICIAL_OFFICER, name: 'Oficial João Ferreira' }
      ]
    };

    const res = await app.request('/api/court-order-threshold/create-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.vault).toBeDefined();
    expect(body.vault.status).toBe(CourtOrderVaultStatus.PENDING_QUORUM);
    expect(body.vault.thresholdRequired).toBe(3);
    expect(body.vault.totalShares).toBe(5);
    expect(body.generatedShares).toHaveLength(5);
    expect(body.vault.proofSeal.sealToken).toMatch(/^threshold_v1_/);
  });

  it('Fluxo Ponta a Ponta: submissão de cotas até o quorum e decifragem do prontuário', async () => {
    // 1. Cria novo cofre
    const createRes = await app.request('/api/court-order-threshold/create-vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId: 'paciente_e2e_test',
        patientMaskedName: 'E2E Teste Sigilo',
        legalCaseNumber: '0009999-99.2026.8.26.0100',
        legalJustification: LegalJustificationType.CFP_ETHICS_INQUIRY,
        thresholdRequired: 3,
        totalShares: 5,
        secretRecordText: 'CONTEUDO SECRETO E2E INTEGRATION TEST',
        custodians: [
          { role: CustodianRole.LEAD_PSYCHOLOGIST, name: 'Dra. Daniela' },
          { role: CustodianRole.DPO_OFFICER, name: 'Carlos' },
          { role: CustodianRole.ETHICS_COMMITTEE_CHAIR, name: 'Beatriz' },
          { role: CustodianRole.LEGAL_COUNSEL, name: 'Roberto' },
          { role: CustodianRole.JUDICIAL_OFFICER, name: 'João' }
        ]
      })
    });
    const created = await createRes.json();
    const vaultId = created.vault.vaultId;
    const shares = created.generatedShares;

    // 2. Tenta decifrar prematuramente sem cotas suficientes -> Falha com quorum insuficiente
    const prematureRes = await app.request('/api/court-order-threshold/reconstruct-decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId })
    });
    const prematureBody = await prematureRes.json();
    expect(prematureBody.success).toBe(false);
    expect(prematureBody.result.verdict).toBe('INSUFFICIENT_SHARES');

    // 3. Submete cota 1 (Lead Psychologist)
    const share1Res = await app.request('/api/court-order-threshold/submit-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId,
        shareIndex: shares[0].shareIndex,
        shareData: shares[0].shareData,
        custodianRole: shares[0].custodianRole
      })
    });
    const share1Body = await share1Res.json();
    expect(share1Body.success).toBe(true);
    expect(share1Body.currentSharesCount).toBe(1);
    expect(share1Body.isQuorumReached).toBe(false);

    // 4. Submete cota duplicada (deve falhar)
    const dupRes = await app.request('/api/court-order-threshold/submit-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId,
        shareIndex: shares[0].shareIndex,
        shareData: shares[0].shareData,
        custodianRole: shares[0].custodianRole
      })
    });
    expect(dupRes.status).toBe(400);

    // 5. Submete cota 2 (DPO)
    await app.request('/api/court-order-threshold/submit-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId,
        shareIndex: shares[1].shareIndex,
        shareData: shares[1].shareData,
        custodianRole: shares[1].custodianRole
      })
    });

    // 6. Submete cota 3 (Ethics Committee) -> Atinge o quorum de 3!
    const share3Res = await app.request('/api/court-order-threshold/submit-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId,
        shareIndex: shares[2].shareIndex,
        shareData: shares[2].shareData,
        custodianRole: shares[2].custodianRole
      })
    });
    const share3Body = await share3Res.json();
    expect(share3Body.success).toBe(true);
    expect(share3Body.isQuorumReached).toBe(true);

    // 7. Agora executa a reconstrução e decifragem
    const decryptRes = await app.request('/api/court-order-threshold/reconstruct-decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId })
    });
    const decryptBody = await decryptRes.json();
    expect(decryptBody.success).toBe(true);
    expect(decryptBody.result.verdict).toBe('VALID_RECONSTRUCTED');
    expect(decryptBody.result.decryptedPayload).toBe('CONTEUDO SECRETO E2E INTEGRATION TEST');
    expect(decryptBody.result.recoveredKeyHex).toBeDefined();
    expect(decryptBody.result.proofSeal.sealToken).toMatch(/^threshold_v1_/);
  });

  it('POST /api/court-order-threshold/simulate-attack deve simular cenários de ataque e bloquear intrusões', async () => {
    const scenarios = [
      'INSUFFICIENT_SHARES_1_OF_3',
      'CORRUPTED_SHARE_DATA',
      'DUPLICATE_CUSTODIAN_REPLAY',
      'EXPIRED_COURT_ORDER_VAULT'
    ] as const;

    for (const scenario of scenarios) {
      const res = await app.request('/api/court-order-threshold/simulate-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.blocked).toBe(true);
      expect(body.scenario).toBe(scenario);
      expect(body.message).toContain('Ataque Bloqueado');
    }
  });

  it('POST /api/court-order-threshold/verify-seal deve validar autenticidade notarial WORM', async () => {
    const overviewRes = await app.request('/api/court-order-threshold/overview', { method: 'GET' });
    const overview = await overviewRes.json();
    const sealToken = overview.overview.activeVaults[0].proofSeal.sealToken;

    const res = await app.request('/api/court-order-threshold/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isValid).toBe(true);
    expect(body.message).toContain('validado com fé pública');
  });
});
