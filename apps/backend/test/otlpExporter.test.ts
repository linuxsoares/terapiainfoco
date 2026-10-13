import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { OtlpExporterProvider, OtlpExportStatus, AuditAction } from '@terapiainfoco/shared';
import { otlpBatchExporter } from '../src/telemetry/otlpBatchExporter';
import { tracer } from '../src/telemetry/openTelemetryTracer';
import { db } from '../src/db/memoryDb';

describe('OpenTelemetry OTLP Exporter & Remote Collectors (RFC-001 §5.2 - Opção N)', () => {
  let adminToken: string;
  let receptionistToken: string;

  beforeEach(async () => {
    globalRateLimitStore.reset();
    otlpBatchExporter.clearQueue();
    otlpBatchExporter.resetStats();

    // Login Admin
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const adminData = await loginAdmin.json();
    adminToken = adminData.accessToken;

    // Login Recepção
    const loginRecep = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recepcao@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const recepData = await loginRecep.json();
    receptionistToken = recepData.accessToken;
  });

  afterEach(() => {
    otlpBatchExporter.setFetchHandler(undefined);
  });

  it('deve barrar acesso de anônimos com 401 e perfis não-ADMIN com 403', async () => {
    const unauth = await app.request('/api/system/telemetry/otlp/status');
    expect(unauth.status).toBe(401);

    const forbidden = await app.request('/api/system/telemetry/otlp/status', {
      headers: { Authorization: `Bearer ${receptionistToken}` }
    });
    expect(forbidden.status).toBe(403);
  });

  it('deve retornar configuração e estatísticas do exportador OTLP para ADMIN', async () => {
    const res = await app.request('/api/system/telemetry/otlp/status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.config).toBeDefined();
    expect(data.stats).toBeDefined();
    expect(data.config.serviceName).toBeDefined();
    expect(data.stats.status).toBeDefined();
  });

  it('deve atualizar a configuração do coletor OTLP e registrar na trilha WORM', async () => {
    const updateRes = await app.request('/api/system/telemetry/otlp/config', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: OtlpExporterProvider.DATADOG,
        endpoint: 'https://otlp.datadoghq.com',
        apiKey: 'dd-api-key-segredo-1234',
        batchSize: 15,
        flushIntervalSeconds: 30
      })
    });

    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);
    expect(updateData.config.provider).toBe(OtlpExporterProvider.DATADOG);
    expect(updateData.config.batchSize).toBe(15);
    // Valida que a chave de API é mascarada
    expect(updateData.config.apiKey).toContain('••••••••');
    expect(updateData.config.apiKey.endsWith('1234')).toBe(true);

    // Valida gravação na trilha WORM
    const lastAudit = db.auditLogs[db.auditLogs.length - 1];
    expect(lastAudit.action).toBe(AuditAction.OTLP_EXPORT_CONFIG_UPDATE);
  });

  it('deve rejeitar atualizações com endpoint URL malformatada', async () => {
    const res = await app.request('/api/system/telemetry/otlp/config', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        endpoint: 'ftp://not-allowed-protocol.com'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('deve enfileirar spans concluídos e despachar lote via flush com mock fetch', async () => {
    const capturedCalls: Array<{ url: string; headers: any; body: any }> = [];

    // Injeta mock fetch handler para validar envio
    otlpBatchExporter.setFetchHandler((async (url: string, init: any) => {
      capturedCalls.push({
        url,
        headers: init.headers,
        body: JSON.parse(init.body)
      });
      return new Response(JSON.stringify({ partialSuccess: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any);

    // Configura provedor Datadog
    otlpBatchExporter.updateConfig({
      enabled: true,
      provider: OtlpExporterProvider.DATADOG,
      endpoint: 'https://otlp.datadoghq.com',
      apiKey: 'dd-test-token-7777',
      exportTraces: true,
      exportMetrics: true
    });

    // Cria e encerra 2 spans através do tracer
    const span1 = tracer.startSpan('clinical.session.start', {
      attributes: { 'session.type': 'telepsicologia' }
    });
    span1.end();

    const span2 = tracer.startSpan('crypto.aes_gcm.encrypt', {
      attributes: { 'field': 'patient_cpf' }
    });
    span2.end();

    expect(otlpBatchExporter.getStats().queuedSpansCount).toBeGreaterThanOrEqual(2);

    // Força o envio em lote via endpoint REST
    const flushRes = await app.request('/api/system/telemetry/otlp/flush', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(flushRes.status).toBe(200);
    const flushData = await flushRes.json();
    expect(flushData.success).toBe(true);
    expect(flushData.result.spansCount).toBeGreaterThanOrEqual(2);

    // Valida chamadas interceptadas pelo mock fetch
    expect(capturedCalls.length).toBeGreaterThanOrEqual(1);
    const tracesCall = capturedCalls.find((c) => c.url.includes('/v1/traces'));
    expect(tracesCall).toBeDefined();
    expect(tracesCall?.url).toBe('https://otlp.datadoghq.com/v1/traces');
    expect(tracesCall?.headers['dd-api-key']).toBe('dd-test-token-7777');
    expect(tracesCall?.body.resourceSpans).toBeDefined();
    expect(tracesCall?.body.resourceSpans[0].scopeSpans[0].spans.length).toBeGreaterThanOrEqual(2);

    // Total exportado deve refletir o lote enviado
    expect(otlpBatchExporter.getStats().totalExportedSpans).toBeGreaterThanOrEqual(2);
    // A fila contém apenas o span gerado pelo próprio middleware HTTP da requisição de flush
    expect(otlpBatchExporter.getStats().queuedSpansCount).toBeLessThanOrEqual(1);
  });

  it('deve realizar teste de conectividade sintético com sucesso e relatar falhas', async () => {
    // Mock simulando sucesso
    otlpBatchExporter.setFetchHandler((async () => {
      return new Response('OK', { status: 200 });
    }) as any);

    const testRes = await app.request('/api/system/telemetry/otlp/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: OtlpExporterProvider.NEW_RELIC,
        endpoint: 'https://otlp.nr-data.net:4318',
        apiKey: 'nr-sample-key'
      })
    });

    expect(testRes.status).toBe(200);
    const testData = await testRes.json();
    expect(testData.success).toBe(true);
    expect(testData.result.spansCount).toBe(1);

    // Mock simulando erro 403 do coletor
    otlpBatchExporter.setFetchHandler((async () => {
      return new Response('Unauthorized API key', { status: 403, statusText: 'Forbidden' });
    }) as any);

    const failRes = await app.request('/api/system/telemetry/otlp/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: OtlpExporterProvider.DATADOG,
        endpoint: 'https://otlp.datadoghq.com',
        apiKey: 'invalid-key'
      })
    });

    expect(failRes.status).toBe(502);
    const failData = await failRes.json();
    expect(failData.success).toBe(false);
    expect(failData.result.error).toContain('403');
  });
});
