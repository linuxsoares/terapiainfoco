import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { TelemetryService } from '../src/telemetry/telemetryService';
import { tracer } from '../src/telemetry/openTelemetryTracer';
import { prometheus } from '../src/telemetry/prometheusRegistry';

describe('OpenTelemetry, Prometheus Metrics & W3C Distributed Tracing (RFC-001 §5.2 - Opção N)', () => {
  let adminToken: string;
  let therapistToken: string;
  let secretaryToken: string;

  beforeEach(async () => {
    db.clear();
    await globalRateLimitStore.reset();

    // 1. Login Admin
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;

    // 2. Login Psicólogo Titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    therapistToken = (await loginTherapist.json()).accessToken;

    // 3. Login Secretária
    const loginSec = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    secretaryToken = (await loginSec.json()).accessToken;
  });

  describe('Prometheus Exporter Endpoint (GET /metrics)', () => {
    it('deve responder GET /metrics em texto puro formatado conforme padrão OpenMetrics v0.0.4', async () => {
      const res = await app.request('/metrics');
      expect(res.status).toBe(200);

      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/plain');
      expect(contentType).toContain('version=0.0.4');

      const body = await res.text();
      // Valida declaração de HELP e TYPE padrão Prometheus
      expect(body).toContain('# HELP http_requests_total');
      expect(body).toContain('# TYPE http_requests_total counter');
      expect(body).toContain('# HELP http_request_duration_seconds');
      expect(body).toContain('# TYPE http_request_duration_seconds histogram');
      expect(body).toContain('# HELP crypto_operations_total');
      expect(body).toContain('# TYPE crypto_operations_total counter');
      expect(body).toContain('# HELP process_memory_rss_bytes');
      expect(body).toContain('# TYPE process_memory_rss_bytes gauge');
    });

    it('deve registrar buckets e somatório no histograma de latência de requisições', async () => {
      // Faz requisições para gerar tráfego
      await app.request('/health');
      await app.request('/health/liveness');

      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('http_request_duration_seconds_bucket');
      expect(body).toContain('http_request_duration_seconds_sum');
      expect(body).toContain('http_request_duration_seconds_count');
    });
  });

  describe('W3C Distributed Tracing & Context Propagation', () => {
    it('deve injetar cabeçalhos x-trace-id, traceparent e x-response-time em qualquer resposta HTTP', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const traceId = res.headers.get('x-trace-id');
      const traceparent = res.headers.get('traceparent');
      const responseTime = res.headers.get('x-response-time');

      expect(traceId).toBeDefined();
      expect(traceId?.length).toBe(32); // 128 bits hex
      expect(/^[0-9a-f]{32}$/.test(traceId!)).toBe(true);

      expect(traceparent).toBeDefined();
      expect(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(traceparent!)).toBe(true);

      expect(responseTime).toBeDefined();
      expect(responseTime).toContain('ms');
    });

    it('deve propagar traceId recebido no cabeçalho W3C traceparent de entrada', async () => {
      const customTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const incomingTraceparent = `00-${customTraceId}-00f067aa0ba902b7-01`;

      const res = await app.request('/health', {
        headers: {
          traceparent: incomingTraceparent
        }
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-trace-id')).toBe(customTraceId);

      const returnedTraceparent = res.headers.get('traceparent');
      expect(returnedTraceparent?.startsWith(`00-${customTraceId}-`)).toBe(true);
    });

    it('deve registrar erro no span quando a requisição falha (status 404/400)', async () => {
      const res = await app.request('/api/rota-inexistente-telemetria');
      expect(res.status).toBe(404);

      const recent = tracer.getRecentSpans(5);
      const notFoundSpan = recent.find((s) => s.attributes['http.target'] === '/api/rota-inexistente-telemetria');
      expect(notFoundSpan).toBeDefined();
      expect(notFoundSpan?.status).toBe('ERROR');
      expect(notFoundSpan?.attributes['http.status_code']).toBe(404);
    });
  });

  describe('Endpoints Administrativos de Telemetria (/api/system/telemetry)', () => {
    it('deve restringir acesso aos endpoints de telemetria apenas para ADMIN', async () => {
      // 1. Sem autenticação -> 401
      const resNoAuth = await app.request('/api/system/telemetry/overview');
      expect(resNoAuth.status).toBe(401);

      // 2. Psicólogo -> 403 Forbidden
      const resTherapist = await app.request('/api/system/telemetry/overview', {
        headers: { Authorization: `Bearer ${therapistToken}` }
      });
      expect(resTherapist.status).toBe(403);

      // 3. Secretária -> 403 Forbidden
      const resSec = await app.request('/api/system/telemetry/overview', {
        headers: { Authorization: `Bearer ${secretaryToken}` }
      });
      expect(resSec.status).toBe(403);

      // 4. Admin -> 200 OK
      const resAdmin = await app.request('/api/system/telemetry/overview', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(resAdmin.status).toBe(200);
    });

    it('deve retornar snapshot completo de telemetria via GET /api/system/telemetry/overview', async () => {
      // Registra operações simuladas
      TelemetryService.recordCryptoOperation('encrypt', 2.5, true);
      TelemetryService.recordCryptoOperation('blind_index', 0.8, true);
      TelemetryService.recordAiSoapGeneration(850, true);
      TelemetryService.recordSessionCompleted();
      TelemetryService.recordWormLog();

      const res = await app.request('/api/system/telemetry/overview', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.telemetry).toBeDefined();

      const t = data.telemetry;
      expect(t.service).toBe('terapiainfoco-backend');
      expect(t.version).toBe('1.0.0');

      // RED Metrics
      expect(t.red).toBeDefined();
      expect(typeof t.red.requestRatePerSec).toBe('number');
      expect(typeof t.red.errorRatePercentage).toBe('number');
      expect(t.red.totalRequests).toBeGreaterThanOrEqual(1);

      // Crypto Metrics
      expect(t.crypto).toBeDefined();
      expect(t.crypto.totalEncryptions).toBeGreaterThanOrEqual(1);
      expect(t.crypto.totalBlindIndexes).toBeGreaterThanOrEqual(1);
      expect(t.crypto.activeKeysInRam).toBeGreaterThanOrEqual(1);

      // Business & System
      expect(t.business).toBeDefined();
      expect(t.business.aiSoapGenerationsTotal).toBeGreaterThanOrEqual(1);
      expect(t.system).toBeDefined();
      expect(t.system.memoryRssMb).toBeGreaterThan(0);
      expect(Array.isArray(t.recentTraces)).toBe(true);
    });

    it('deve listar spans recentes do OTel via GET /api/system/telemetry/traces', async () => {
      const res = await app.request('/api/system/telemetry/traces?limit=10', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.traces)).toBe(true);
      expect(data.traces.length).toBeGreaterThan(0);

      const span = data.traces[0];
      expect(span.traceId).toBeDefined();
      expect(span.spanId).toBeDefined();
      expect(span.name).toBeDefined();
      expect(['SERVER', 'INTERNAL', 'CLIENT', 'PRODUCER', 'CONSUMER']).toContain(span.kind);
    });

    it('deve exportar payload bruto Prometheus via GET /api/system/telemetry/metrics-raw', async () => {
      const res = await app.request('/api/system/telemetry/metrics-raw', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.format).toBe('prometheus_text');
      expect(typeof data.metrics).toBe('string');
      expect(data.metrics).toContain('# HELP http_requests_total');
      expect(data.metrics).toContain('# HELP crypto_operations_total');
    });
  });

  describe('Instrumentação Interna do Tracer & Registry', () => {
    it('deve permitir criação manual de sub-spans com eventos e atributos', () => {
      const rootSpan = tracer.startSpan('clinical.soap_evaluation', {
        kind: 'INTERNAL',
        attributes: {
          'session.id': 'test-session-123',
          'ai.model': 'google-gemini-pro'
        }
      });

      rootSpan.addEvent('ai_prompt_sent', { tokens: 450 });
      rootSpan.addEvent('ai_response_received', { latencyMs: 250 });
      rootSpan.setAttribute('result.word_count', 180);
      const completed = rootSpan.end();

      expect(completed.name).toBe('clinical.soap_evaluation');
      expect(completed.durationMs).toBeGreaterThanOrEqual(0);
      expect(completed.events?.length).toBe(2);
      expect(completed.attributes['session.id']).toBe('test-session-123');
    });

    it('deve calcular estatísticas de snapshot RED e percentis corretamente no Registry', () => {
      prometheus.incCounter('http_requests_total', { method: 'GET', route: '/api/test', status: '200' });
      prometheus.incCounter('http_requests_total', { method: 'POST', route: '/api/test', status: '500' });
      prometheus.observeHistogram('http_request_duration_seconds', 0.05, { method: 'GET', route: '/api/test' });
      prometheus.observeHistogram('http_request_duration_seconds', 0.15, { method: 'POST', route: '/api/test' });

      const snapshot = prometheus.getSnapshotData();
      expect(snapshot.red.totalRequests).toBeGreaterThanOrEqual(2);
      expect(snapshot.red.p50DurationMs).toBeGreaterThan(0);
      expect(snapshot.red.p95DurationMs).toBeGreaterThan(0);
    });
  });
});
