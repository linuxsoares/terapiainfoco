/**
 * Testes de Integração da API REST de Web Cache Poisoning & Cache Deception Guard
 * (RFC 7234, RFC 9111 & OWASP ASVS v4.0)
 */

import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  ResourceSensitivityLevel,
  CacheThreatType,
  type CacheGuardOverviewResponse,
  type InspectCacheResponseDTO,
  type SimulateCacheAttackResponseDTO,
  type UpdateCachePolicyResponseDTO,
  type VerifyCacheSealResponseDTO
} from '@terapiainfoco/shared';

describe('Web Cache Poisoning & Cache Deception Guard REST API (/api/cache-guard)', () => {
  it('GET /api/cache-guard/overview - deve retornar telemetria e governança de cache', async () => {
    const res = await app.request('/api/cache-guard/overview', {
      method: 'GET'
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as CacheGuardOverviewResponse;
    expect(body.success).toBe(true);
    expect(body.overview.metrics).toBeDefined();
    expect(body.overview.policy).toBeDefined();
    expect(body.overview.sampleProtectedRoutes.length).toBeGreaterThan(0);
    expect(body.overview.recentIncidents).toBeInstanceOf(Array);
  });

  it('POST /api/cache-guard/inspect - deve aprovar requisição clínica íntegra com diretiva no-store', async () => {
    const res = await app.request('/api/cache-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: '/api/patients/active?page=1',
        headers: {
          'host': 'app.terapiainfoco.com.br',
          'authorization': 'Bearer test-valid-jwt'
        },
        sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as InspectCacheResponseDTO;
    expect(body.success).toBe(true);
    expect(body.inspection.isSafe).toBe(true);
    expect(body.inspection.recommendedCacheControl).toContain('no-store');
    expect(body.inspection.seal.sealId).toStartWith('cache_guard_v1_');
  });

  it('POST /api/cache-guard/inspect - deve interceptar injeção de cabeçalho não-chaveado (X-Forwarded-Host)', async () => {
    const res = await app.request('/api/cache-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: '/api/patients/123/records',
        headers: {
          'host': 'app.terapiainfoco.com.br',
          'x-forwarded-host': 'attacker-phishing.com'
        },
        sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as InspectCacheResponseDTO;
    expect(body.success).toBe(true);
    expect(body.inspection.isSafe).toBe(false);
    expect(body.inspection.threats.some(t => t.threatType === CacheThreatType.UNKEYED_HEADER_INJECTION)).toBe(true);
    expect(body.inspection.headersToStrip).toContain('x-forwarded-host');
  });

  it('POST /api/cache-guard/inspect - deve interceptar tentativa de Web Cache Deception em rota clínica', async () => {
    const res = await app.request('/api/cache-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: '/api/patients/123/soap-notes.css',
        headers: {
          'host': 'app.terapiainfoco.com.br'
        },
        sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as InspectCacheResponseDTO;
    expect(body.success).toBe(true);
    expect(body.inspection.isSafe).toBe(false);
    expect(body.inspection.threats.some(t => t.threatType === CacheThreatType.EXTENSION_CONFUSION_DECEPTION)).toBe(true);
  });

  it('PUT /api/cache-guard/policy - deve atualizar parâmetros de política e registrar na trilha WORM', async () => {
    const res = await app.request('/api/cache-guard/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy: {
          maxQueryParameters: 12
        }
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as UpdateCachePolicyResponseDTO;
    expect(body.success).toBe(true);
    expect(body.policy.maxQueryParameters).toBe(12);
  });

  it('POST /api/cache-guard/simulate - deve executar simulação de ataque de envenenamento e deception', async () => {
    const res = await app.request('/api/cache-guard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attackType: CacheThreatType.UNKEYED_HEADER_INJECTION,
        targetPath: '/api/consultations/active'
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as SimulateCacheAttackResponseDTO;
    expect(body.success).toBe(true);
    expect(body.threatDetected).toBe(true);
    expect(body.incident).toBeDefined();
    expect(body.inspection.headersToStrip).toContain('x-forwarded-host');
  });

  it('POST /api/cache-guard/verify-seal - deve validar selo probatório emitido com fé pública', async () => {
    // 1. Obtém um selo válido através de uma inspeção
    const inspectRes = await app.request('/api/cache-guard/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        url: '/api/documents/signed-test',
        headers: { 'host': 'app.terapiainfoco.com.br' },
        sensitivity: ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      })
    });
    const inspectData = (await inspectRes.json()) as InspectCacheResponseDTO;
    const seal = inspectData.inspection.seal;

    // 2. Valida o selo
    const verifyRes = await app.request('/api/cache-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sealToken: seal
      })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = (await verifyRes.json()) as VerifyCacheSealResponseDTO;
    expect(verifyData.success).toBe(true);
    expect(verifyData.isValid).toBe(true);
    expect(verifyData.seal?.sealId).toBe(seal.sealId);
  });
});
