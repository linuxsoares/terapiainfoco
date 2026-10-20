import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import { HppAttackCategory, HppDefensePolicy, HppSeverityLevel } from '@terapiainfoco/shared';
import { adminRequest } from './helpers/adminRequest';

describe('HTTP Security Guard API — Parameter Pollution (HPP) & Header Injection (CRLF)', () => {
  it('GET /api/http-guard/overview deve retornar visão geral e métricas de proteção', async () => {
    const res = await adminRequest('/api/http-guard/overview');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.overview).toBeDefined();
    expect(data.overview.metrics.totalInspectedRequests).toBeGreaterThanOrEqual(14000);
    expect(data.overview.metrics.hppPollutionsBlocked).toBeGreaterThanOrEqual(1);
    expect(data.overview.metrics.crlfInjectionsNeutralized).toBeGreaterThanOrEqual(1);
    expect(data.overview.protectedEndpoints.length).toBeGreaterThan(0);
    expect(data.overview.recentIncidents.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/http-guard/simulate-hpp deve detectar e bloquear poluição em parâmetro clínico sensível', async () => {
    const payload = {
      endpoint: '/api/clinical-records/sign',
      method: 'POST',
      queryString: 'patientId=paciente_100&patientId=paciente_evil&action=sign',
      defensePolicy: HppDefensePolicy.REJECT_REQUEST,
      clientIp: '189.40.55.12'
    };

    const res = await adminRequest('/api/http-guard/simulate-hpp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(true);
    expect(data.inspectionResult.isPolluted).toBe(true);
    expect(data.inspectionResult.severity).toBe(HppSeverityLevel.CRITICAL);
    expect(data.incident).toBeDefined();
    expect(data.incident.category).toBe(HppAttackCategory.HTTP_PARAMETER_POLLUTION);
    expect(data.incident.proofSealToken).toMatch(/^seal_http_guard_/);
  });

  it('POST /api/http-guard/simulate-hpp deve permitir requisição com parâmetros limpos e únicos', async () => {
    const payload = {
      endpoint: '/api/patients',
      method: 'GET',
      queryString: 'cpfHash=abc123canonical&status=active',
      defensePolicy: HppDefensePolicy.REJECT_REQUEST
    };

    const res = await adminRequest('/api/http-guard/simulate-hpp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(false);
    expect(data.inspectionResult.isPolluted).toBe(false);
    expect(data.incident).toBeUndefined();
  });

  it('POST /api/http-guard/simulate-header-injection deve neutralizar injeção de Cookie Poisoning via CRLF', async () => {
    const payload = {
      endpoint: '/api/documents/sign',
      method: 'POST',
      headerName: 'Location',
      headerValue: '/dashboard%0d%0aSet-Cookie: session_hijack=forged_token; Secure; HttpOnly',
      clientIp: '200.19.40.77'
    };

    const res = await adminRequest('/api/http-guard/simulate-header-injection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(true);
    expect(data.inspectionResult.hasInjection).toBe(true);
    expect(data.incident).toBeDefined();
    expect(data.incident.category).toBe(HppAttackCategory.COOKIE_POISONING);
    expect(data.incident.severity).toBe(HppSeverityLevel.CRITICAL);
    expect(data.incident.proofSealToken).toBeDefined();
  });

  it('POST /api/http-guard/simulate-header-injection deve aprovar cabeçalho íntegro sem CRLF', async () => {
    const payload = {
      endpoint: '/api/appointments',
      method: 'POST',
      headerName: 'X-Client-Version',
      headerValue: 'TerapiaInFoco-Web-2.4.0'
    };

    const res = await adminRequest('/api/http-guard/simulate-header-injection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.blocked).toBe(false);
    expect(data.inspectionResult.hasInjection).toBe(false);
  });

  it('POST /api/http-guard/verify-seal deve validar com fé pública selo gerado por incidente', async () => {
    // 1. Gera incidente via simulação
    const simRes = await adminRequest('/api/http-guard/simulate-hpp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: '/api/clinical-records/sign',
        queryString: 'token=t1&token=t2'
      })
    });
    const simData = await simRes.json();
    const token = simData.incident.proofSealToken;

    // 2. Valida o selo
    const verifyRes = await adminRequest('/api/http-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofSealToken: token })
    });

    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.isValid).toBe(true);
    expect(verifyData.seal.canonicalDigest).toBeDefined();
    expect(verifyData.seal.hmacSignature).toBeDefined();
  });

  it('POST /api/http-guard/verify-seal deve rejeitar token inexistente', async () => {
    const res = await adminRequest('/api/http-guard/verify-seal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofSealToken: 'seal_http_guard_invalid_token_999999' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.isValid).toBe(false);
  });

  it('GET /api/http-guard/incidents deve retornar lista de incidentes registrados', async () => {
    const res = await adminRequest('/api/http-guard/incidents');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.incidents)).toBe(true);
    expect(data.incidents.length).toBeGreaterThanOrEqual(1);
  });
});
