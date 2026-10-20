import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  SideChannelProtectionMode,
  SideChannelTargetOperation,
  SideChannelVulnerabilityLevel
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('Side-Channel & Timing Attack Shield API Integration (/api/side-channel)', () => {
  it('GET /api/side-channel/overview - deve retornar visão consolidada com status NIST e métricas', async () => {
    const res = await adminRequest('/api/side-channel/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.overview).toBeDefined();
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.metrics.totalInspectionsCount).toBeGreaterThanOrEqual(2);
    expect(body.overview.metrics.systemHealth).toBe('IMMUNE');
    expect(body.overview.activeProtectionMode).toBeDefined();
    expect(body.overview.recentBenchmarks.length).toBeGreaterThanOrEqual(1);
    expect(body.overview.recentInspections.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/side-channel/inspect-operation - deve validar payload obrigatório', async () => {
    const res = await adminRequest('/api/side-channel/inspect-operation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('A operação alvo de inspeção é obrigatória');
  });

  it('POST /api/side-channel/inspect-operation - deve inspecionar com sucesso em modo seguro', async () => {
    const res = await adminRequest('/api/side-channel/inspect-operation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOperation: SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
        payloadA: 'tag_esperada_9999_super_secreta',
        payloadB: 'tag_esperada_9999_super_secreta',
        iterations: 60
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inspection).toBeDefined();
    expect(body.inspection.constantTimeGuaranteed).toBe(true);
    expect(body.inspection.vulnerabilityLevel).toBe(SideChannelVulnerabilityLevel.IMMUNE_NIST_COMPLIANT);
    expect(body.inspection.id).toBeDefined();
  });

  it('POST /api/side-channel/run-welch-test - deve rodar análise estatística de Welch t-test com critério NIST e selo WORM', async () => {
    const res = await adminRequest('/api/side-channel/run-welch-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOperation: SideChannelTargetOperation.BLIND_INDEX_HMAC_COMPUTE,
        sampleSize: 60
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toBeDefined();
    expect(body.report.welchTest).toBeDefined();
    expect(body.report.welchTest.tScore).toBeLessThan(4.5);
    expect(body.report.welchTest.nistCompliant).toBe(true);
    expect(body.report.isTimingSafe).toBe(true);
    expect(body.report.proofSeal).toBeDefined();
    expect(body.report.proofSeal.sealToken).toContain('side_channel_proof_v1_');
  });

  it('POST /api/side-channel/calibrate-jitter - deve calibrar jitter estocástico gaussiano', async () => {
    const res = await adminRequest('/api/side-channel/calibrate-jitter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetLatencyMs: 6.0,
        varianceMs: 1.5
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.activeJitterTargetMs).toBe(6.0);
    expect(body.message).toContain('Jitter estocástico calibrado');
  });

  it('POST /api/side-channel/update-policy - deve atualizar o modo operacional de blindagem', async () => {
    const res = await adminRequest('/api/side-channel/update-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protectionMode: SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.protectionMode).toBe(SideChannelProtectionMode.CONSTANT_TIME_PLUS_GAUSSIAN_JITTER);
  });

  it('POST /api/side-channel/simulate-timing-attack - deve executar simulação comparativa de pentest seguro', async () => {
    const res = await adminRequest('/api/side-channel/simulate-timing-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOperation: SideChannelTargetOperation.PASSWORD_PBKDF2_COMPARE,
        useVulnerableAlgorithm: false
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.detectedLeak).toBe(false);
    expect(body.welchTScore).toBeLessThan(4.5);
    expect(body.message).toContain('DEFESA BEM-SUCEDIDA');
  });

  it('POST /api/side-channel/simulate-timing-attack - deve detectar timing leak com algoritmo vulnerável', async () => {
    const res = await adminRequest('/api/side-channel/simulate-timing-attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOperation: SideChannelTargetOperation.RSA_MODULAR_EXPONENTIATION,
        useVulnerableAlgorithm: true
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.detectedLeak).toBe(true);
    expect(body.welchTScore).toBeGreaterThanOrEqual(4.5);
    expect(body.message).toContain('VULNERABILIDADE DETECTADA');
  });

  it('POST /api/side-channel/verify-seal - deve verificar a integridade WORM do selo de benchmark', async () => {
    // 1. Gera um benchmark com selo WORM
    const welchRes = await adminRequest('/api/side-channel/run-welch-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetOperation: SideChannelTargetOperation.AES_GCM_AUTH_TAG_VERIFY,
        sampleSize: 40
      })
    });
    const welchBody = await welchRes.json();
    const seal = welchBody.report.proofSeal;

    // 2. Valida o selo gerado
    const verifyRes = await adminRequest('/api/side-channel/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: seal.sealToken })
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.isValid).toBe(true);
    expect(verifyBody.seal).toBeDefined();

    // 3. Testa selo com token adulterado/inválido
    const invalidRes = await adminRequest('/api/side-channel/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: 'side_channel_proof_v1_token_adulterado_falso_invalido' })
    });

    expect(invalidRes.status).toBe(200);
    const invalidBody = await invalidRes.json();
    expect(invalidBody.success).toBe(false);
    expect(invalidBody.isValid).toBe(false);
  });
});
