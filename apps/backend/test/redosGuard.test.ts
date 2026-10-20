import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import {
  UserRole,
  RegexVulnerabilityType,
  RegexComplexityRisk,
  RegexSanitizationAction
} from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('API Integration: ReDoS Guard & Safe Regex Engine (CWE-1333 & OWASP ASVS V5.5)', () => {
  it('GET /api/redos-guard/overview - deve retornar telemetria, presets e políticas ativas', async () => {
    const res = await adminRequest('/api/redos-guard/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalEvaluations).toBeGreaterThan(0);
    expect(data.overview.policy.maxExecutionTimeMs).toBe(25);
    expect(data.overview.clinicalPresets.length).toBeGreaterThanOrEqual(7);
  });

  it('POST /api/redos-guard/analyze - deve aprovar e analisar regex linear seguro', async () => {
    const res = await adminRequest('/api/redos-guard/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'psi_analyst_01',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        pattern: '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$',
        testInput: '123.456.789-00'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.analysis.isVulnerable).toBe(false);
    expect(data.analysis.complexity).toBe(RegexComplexityRisk.SAFE_LINEAR);
    expect(data.execution).toBeDefined();
    expect(data.execution.matched).toBe(true);
    expect(data.seal).toBeDefined();
    expect(data.seal.sealId).toStartWith('redos_seal_');
  });

  it('POST /api/redos-guard/analyze - deve bloquear Evil Regex exponencial sob modo estrito', async () => {
    // Primeiro garante que autoRewrite esteja desativado para testar bloqueio estrito
    await adminRequest('/api/redos-guard/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'admin_sec',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        policy: {
          blockExponentialPatterns: true,
          autoRewriteIfPossible: false
        }
      })
    });

    const res = await adminRequest('/api/redos-guard/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'adversary_probe',
        'x-user-role': UserRole.PSICOLOGO_TITULAR
      },
      body: JSON.stringify({
        pattern: '(a+)+$',
        testInput: 'aaaaaaaaaaaaaaaaaaaaaaaa!'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.analysis.isVulnerable).toBe(true);
    expect(data.analysis.complexity).toBe(RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL);
    expect(data.analysis.vulnerabilityType).toBe(RegexVulnerabilityType.NESTED_QUANTIFIERS);
    expect(data.seal).toBeDefined();

    // Restaura política com autoRewrite habilitado
    await adminRequest('/api/redos-guard/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'admin_sec',
        'x-user-role': UserRole.ADMIN
      },
      body: JSON.stringify({
        policy: {
          blockExponentialPatterns: true,
          autoRewriteIfPossible: true
        }
      })
    });
  });

  it('POST /api/redos-guard/execute - deve executar regex seguro e retornar métricas de tempo', async () => {
    const res = await adminRequest('/api/redos-guard/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: '^[0-9A-Z]{4}$',
        input: '6A70'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result.matched).toBe(true);
    expect(data.result.executionTimeMs).toBeDefined();
    expect(data.seal).toBeDefined();
  });

  it('PUT /api/redos-guard/policy - deve rejeitar alteração de política por perfil não autorizado', async () => {
    const res = await adminRequest('/api/redos-guard/policy', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': UserRole.RECEPCAO_SECRETARIA
      },
      body: JSON.stringify({
        policy: { maxExecutionTimeMs: 100 }
      })
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('POST /api/redos-guard/simulate - deve simular e neutralizar ataque de ReDoS', async () => {
    const res = await adminRequest('/api/redos-guard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vulnerabilityType: RegexVulnerabilityType.OVERLAPPING_DISJUNCTION,
        customInputSize: 30
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.threatBlocked).toBe(true);
    expect(data.attackPattern).toBeDefined();
    expect(data.analysis.isVulnerable).toBe(true);
  });

  it('POST /api/redos-guard/verify-seal - deve verificar validade notarial WORM do selo', async () => {
    // 1. Gera um selo via analyze
    const analyzeRes = await adminRequest('/api/redos-guard/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: '^CRP\\s?\\d{2}\\/\\d{4,6}$',
        testInput: 'CRP 06/123456'
      })
    });

    const analyzeData = await analyzeRes.json();
    const validSeal = analyzeData.seal;

    // 2. Valida o selo autêntico
    const verifyRes = await adminRequest('/api/redos-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: validSeal })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.isValid).toBe(true);

    // 3. Valida selo forjado/adulterado
    const tamperedSeal = { ...validSeal, complexity: RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL };
    const tamperedRes = await adminRequest('/api/redos-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sealToken: tamperedSeal })
    });

    const tamperedData = await tamperedRes.json();
    expect(tamperedData.isValid).toBe(false);
  });
});
