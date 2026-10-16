import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import {
  Http2ThreatCategory,
  Http2ValidationAction,
  Http2ProtocolTarget,
} from '@terapiainfoco/shared';

describe('Backend API Integration - HTTP/2 & gRPC Header Guard (RFC 9113, CWE-113, CWE-444)', () => {
  describe('GET /api/http2-guard/overview', () => {
    it('deve retornar telemetria completa, métricas de desincronização e incidentes', async () => {
      const res = await app.request('/api/http2-guard/overview');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.overview).toBeDefined();
      expect(data.overview.metrics.totalRequestsInspected).toBeGreaterThan(0);
      expect(data.overview.policy.maxHeaderNameLength).toBeGreaterThan(0);
      expect(data.overview.recentIncidents.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/http2-guard/inspect', () => {
    it('deve autorizar e emitir selo WORM para requisição HTTP/2 legítima', async () => {
      const res = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: [
            { name: ':method', value: 'GET' },
            { name: ':path', value: '/api/patients/pat_123' },
            { name: ':authority', value: 'api.terapiainfoco.com.br' },
            { name: ':scheme', value: 'https' },
            { name: 'authorization', value: 'Bearer eyJhbGciOiJIUzI1Ni...' },
          ],
          protocolTarget: Http2ProtocolTarget.HTTP2_REST,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isValid).toBe(true);
      expect(data.action).toBe(Http2ValidationAction.ALLOW);
      expect(data.inspection.seal.sealToken).toMatch(/^h2_desync_seal_/);
    });

    it('deve retornar 400 se headers não for informado ou não for array', async () => {
      const res = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('obrigatória');
    });

    it('deve bloquear e registrar incidente para requisição com transfer-encoding (H2.TE Smuggling)', async () => {
      const res = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: [
            { name: ':method', value: 'POST' },
            { name: ':path', value: '/api/clinical-records' },
            { name: ':authority', value: 'api.terapiainfoco.com.br' },
            { name: ':scheme', value: 'https' },
            { name: 'transfer-encoding', value: 'chunked' },
          ],
          protocolTarget: Http2ProtocolTarget.HTTP2_REST,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isValid).toBe(false);
      expect(data.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(data.incident).toBeDefined();
      expect(data.incident.category).toBe(Http2ThreatCategory.H2_TE_SMUGGLING);
    });

    it('deve bloquear injeção CRLF em cabeçalho authorization (CWE-113)', async () => {
      const res = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: [
            { name: ':method', value: 'GET' },
            { name: ':path', value: '/api/patients' },
            { name: ':authority', value: 'api.terapiainfoco.com.br' },
            { name: ':scheme', value: 'https' },
            { name: 'authorization', value: "Bearer eyJhbG...\r\nX-Admin: true" },
          ],
          protocolTarget: Http2ProtocolTarget.HTTP2_REST,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isValid).toBe(false);
      expect(data.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(data.incident?.category).toBe(Http2ThreatCategory.CRLF_HEADER_SPLIT);
    });

    it('deve validar chamada gRPC legítima com trailers e timeout de 5 segundos', async () => {
      const res = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: [
            { name: ':method', value: 'POST' },
            { name: ':path', value: '/terapiainfoco.ClinicalTelemetry/GetStream' },
            { name: ':authority', value: 'grpc.terapiainfoco.com.br' },
            { name: ':scheme', value: 'https' },
            { name: 'content-type', value: 'application/grpc' },
            { name: 'te', value: 'trailers' },
            { name: 'grpc-timeout', value: '5S' },
          ],
          protocolTarget: Http2ProtocolTarget.GRPC_STREAM,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isValid).toBe(true);
      expect(data.action).toBe(Http2ValidationAction.ALLOW);
    });
  });

  describe('POST /api/http2-guard/policy', () => {
    it('deve atualizar diretrizes de governança HTTP/2 com sucesso', async () => {
      const res = await app.request('/api/http2-guard/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxTotalHeadersCount: 80,
          strictContentLengthValidation: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.policy.maxTotalHeadersCount).toBe(80);
      expect(data.message).toContain('atualizada com sucesso');
    });
  });

  describe('POST /api/http2-guard/simulate', () => {
    it('deve simular ataque H2_TE_SMUGGLING e interceptar', async () => {
      const res = await app.request('/api/http2-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatCategory: Http2ThreatCategory.H2_TE_SMUGGLING,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
      expect(data.incident).toBeDefined();
    });

    it('deve simular ataque CRLF_HEADER_SPLIT e neutralizar', async () => {
      const res = await app.request('/api/http2-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatCategory: Http2ThreatCategory.CRLF_HEADER_SPLIT,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
    });

    it('deve simular ataque GRPC_HEADER_TAMPERING com timeout adulterado', async () => {
      const res = await app.request('/api/http2-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threatCategory: Http2ThreatCategory.GRPC_HEADER_TAMPERING,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threatBlocked).toBe(true);
    });

    it('deve retornar 400 se categoria não for informada', async () => {
      const res = await app.request('/api/http2-guard/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('obrigatória');
    });
  });

  describe('POST /api/http2-guard/verify-seal', () => {
    it('deve verificar com sucesso um selo gerado na inspeção', async () => {
      // 1. Inspeciona para obter um selo válido
      const inspectRes = await app.request('/api/http2-guard/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: [
            { name: ':method', value: 'GET' },
            { name: ':path', value: '/api/compliance' },
            { name: ':authority', value: 'api.terapiainfoco.com.br' },
            { name: ':scheme', value: 'https' },
          ],
        }),
      });

      const inspectData = await inspectRes.json();
      const seal = inspectData.inspection.seal;
      expect(seal).toBeDefined();

      // 2. Valida o selo
      const verifyRes = await app.request('/api/http2-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealToken: JSON.stringify(seal) }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.isValid).toBe(true);
      expect(verifyData.message).toContain('autêntica e íntegra');
    });

    it('deve rejeitar selo adulterado', async () => {
      const forgedSeal = {
        sealToken: 'h2_desync_seal_00000000000000000000000000000000',
        timestamp: new Date().toISOString(),
        protocolTarget: Http2ProtocolTarget.HTTP2_REST,
        headersHash: 'badhash',
        actionTaken: Http2ValidationAction.ALLOW,
        threatCount: 0,
        sanitizedHeaderCount: 0,
        hmacSignature: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      };

      const res = await app.request('/api/http2-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealToken: JSON.stringify(forgedSeal) }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isValid).toBe(false);
      expect(data.message).toContain('Falha na validação criptográfica');
    });

    it('deve retornar 400 se sealToken não for enviado', async () => {
      const res = await app.request('/api/http2-guard/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.message).toContain('obrigatório');
    });
  });
});
