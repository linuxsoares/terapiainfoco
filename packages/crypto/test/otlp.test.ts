import { describe, it, expect } from 'bun:test';
import {
  formatOtlpAttributeValue,
  mapSpanKindToOtlp,
  buildOtlpHeaders,
  validateOtlpEndpoint,
  resolveOtlpEndpoint,
  formatOtlpTracesPayload,
  formatOtlpMetricsPayload
} from '../src/otlp';
import { OtlpExporterProvider } from '@terapiainfoco/shared';
import type { TraceSpan } from '@terapiainfoco/shared';

describe('OpenTelemetry OTLP Exporter Engine (RFC-001 §5.2 - Opção N)', () => {
  describe('formatOtlpAttributeValue & mapSpanKindToOtlp', () => {
    it('deve formatar valores primitivos no padrão tipado OTLP JSON', () => {
      expect(formatOtlpAttributeValue('teste')).toEqual({ stringValue: 'teste' });
      expect(formatOtlpAttributeValue(200)).toEqual({ intValue: 200 });
      expect(formatOtlpAttributeValue(12.34)).toEqual({ doubleValue: 12.34 });
      expect(formatOtlpAttributeValue(true)).toEqual({ boolValue: true });
      expect(formatOtlpAttributeValue(false)).toEqual({ boolValue: false });
    });

    it('deve mapear os kinds de span conforme enum numérico OTLP', () => {
      expect(mapSpanKindToOtlp('INTERNAL')).toBe(1);
      expect(mapSpanKindToOtlp('SERVER')).toBe(2);
      expect(mapSpanKindToOtlp('CLIENT')).toBe(3);
      expect(mapSpanKindToOtlp('PRODUCER')).toBe(4);
      expect(mapSpanKindToOtlp('CONSUMER')).toBe(5);
      expect(mapSpanKindToOtlp(undefined)).toBe(1);
      expect(mapSpanKindToOtlp('UNKNOWN')).toBe(1);
    });
  });

  describe('buildOtlpHeaders', () => {
    it('deve gerar cabeçalhos de autenticação específicos por provedor', () => {
      // Datadog
      const ddHeaders = buildOtlpHeaders(OtlpExporterProvider.DATADOG, 'dd-secret-key-123');
      expect(ddHeaders['Content-Type']).toBe('application/json');
      expect(ddHeaders['dd-api-key']).toBe('dd-secret-key-123');

      // New Relic
      const nrHeaders = buildOtlpHeaders(OtlpExporterProvider.NEW_RELIC, 'nr-license-key-456');
      expect(nrHeaders['api-key']).toBe('nr-license-key-456');

      // Dynatrace
      const dtHeaders = buildOtlpHeaders(OtlpExporterProvider.DYNATRACE, 'dt0c01.sample.token');
      expect(dtHeaders['Authorization']).toBe('Api-Token dt0c01.sample.token');

      // Generic Collector / Custom
      const genHeaders = buildOtlpHeaders(OtlpExporterProvider.GENERIC_COLLECTOR, 'bearer-token-789');
      expect(genHeaders['Authorization']).toBe('Bearer bearer-token-789');
    });

    it('deve permitir sobreposição com cabeçalhos customizados', () => {
      const headers = buildOtlpHeaders(
        OtlpExporterProvider.CUSTOM,
        undefined,
        { 'X-Custom-Tenant': 'tenant-clinic-01' }
      );
      expect(headers['X-Custom-Tenant']).toBe('tenant-clinic-01');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('validateOtlpEndpoint & resolveOtlpEndpoint', () => {
    it('deve validar corretamente as URLs de coletores', () => {
      expect(validateOtlpEndpoint('http://localhost:4318').valid).toBe(true);
      expect(validateOtlpEndpoint('https://otlp.datadoghq.com').valid).toBe(true);
      expect(validateOtlpEndpoint('').valid).toBe(false);
      expect(validateOtlpEndpoint('ftp://invalid.com').valid).toBe(false);
      expect(validateOtlpEndpoint('invalid-url').valid).toBe(false);
    });

    it('deve resolver URLs corretas com sufixos /v1/traces e /v1/metrics', () => {
      // Default Datadog
      const dd = resolveOtlpEndpoint(OtlpExporterProvider.DATADOG);
      expect(dd.tracesUrl).toBe('https://otlp.datadoghq.com/v1/traces');
      expect(dd.metricsUrl).toBe('https://otlp.datadoghq.com/v1/metrics');

      // Default New Relic
      const nr = resolveOtlpEndpoint(OtlpExporterProvider.NEW_RELIC);
      expect(nr.tracesUrl).toBe('https://otlp.nr-data.net:4318/v1/traces');
      expect(nr.metricsUrl).toBe('https://otlp.nr-data.net:4318/v1/metrics');

      // Custom com /v1/traces já fornecido
      const custom = resolveOtlpEndpoint(
        OtlpExporterProvider.CUSTOM,
        'http://collector.internal:4318/v1/traces'
      );
      expect(custom.tracesUrl).toBe('http://collector.internal:4318/v1/traces');
      expect(custom.metricsUrl).toBe('http://collector.internal:4318/v1/metrics');
    });
  });

  describe('formatOtlpTracesPayload', () => {
    it('deve serializar spans conforme formato oficial OTLP JSON ExportTraceServiceRequest', () => {
      const sampleSpan: TraceSpan = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        parentSpanId: '5fb397be34d23b0f',
        name: 'POST /api/appointments',
        kind: 'SERVER',
        startTimeMs: 1700000000000,
        endTimeMs: 1700000000050,
        durationMs: 50,
        status: 'OK',
        attributes: {
          'http.method': 'POST',
          'http.status_code': 201,
          'user.role': 'PSICOLOGO_TITULAR',
          'clinical.encrypted': true
        },
        events: [
          {
            name: 'kms_dek_unwrap',
            timestampMs: 1700000000010,
            attributes: { 'kms.key_version': 2 }
          }
        ]
      };

      const payload = formatOtlpTracesPayload([sampleSpan], {
        serviceName: 'terapiainfoco-api',
        serviceVersion: '1.2.0',
        environment: 'staging'
      });

      expect(payload.resourceSpans).toBeDefined();
      expect(payload.resourceSpans.length).toBe(1);

      const resource = payload.resourceSpans[0].resource;
      const serviceNameAttr = resource.attributes.find((a: any) => a.key === 'service.name');
      expect(serviceNameAttr.value.stringValue).toBe('terapiainfoco-api');

      const scopeSpans = payload.resourceSpans[0].scopeSpans;
      expect(scopeSpans.length).toBe(1);

      const spans = scopeSpans[0].spans;
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(span.spanId).toBe('00f067aa0ba902b7');
      expect(span.parentSpanId).toBe('5fb397be34d23b0f');
      expect(span.name).toBe('POST /api/appointments');
      expect(span.kind).toBe(2); // SERVER
      expect(span.startTimeUnixNano).toBe('1700000000000000000');
      expect(span.endTimeUnixNano).toBe('1700000000050000000');
      expect(span.status.code).toBe(1); // OK

      // Atributos
      const httpMethod = span.attributes.find((a: any) => a.key === 'http.method');
      expect(httpMethod.value.stringValue).toBe('POST');
      const statusCode = span.attributes.find((a: any) => a.key === 'http.status_code');
      expect(statusCode.value.intValue).toBe(201);
      const encrypted = span.attributes.find((a: any) => a.key === 'clinical.encrypted');
      expect(encrypted.value.boolValue).toBe(true);

      // Eventos
      expect(span.events.length).toBe(1);
      expect(span.events[0].name).toBe('kms_dek_unwrap');
    });

    it('deve indicar código de erro 2 e mensagem para spans com falha', () => {
      const errorSpan: TraceSpan = {
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        name: 'POST /api/auth/login',
        kind: 'SERVER',
        startTimeMs: 1700000000000,
        endTimeMs: 1700000000030,
        durationMs: 30,
        status: 'ERROR',
        attributes: {
          'error.message': 'Credenciais inválidas'
        }
      };

      const payload = formatOtlpTracesPayload([errorSpan]);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.status.code).toBe(2);
      expect(span.status.message).toBe('Credenciais inválidas');
    });
  });

  describe('formatOtlpMetricsPayload', () => {
    it('deve serializar métricas RED e criptográficas no formato OTLP ExportMetricsServiceRequest', () => {
      const snapshot = {
        red: {
          totalRequests: 1500,
          errorCount: 3,
          p95Ms: 18.5
        },
        crypto: {
          totalOperations: 450
        },
        system: {
          processMemoryRssBytes: 125829120
        }
      };

      const payload = formatOtlpMetricsPayload(snapshot);
      expect(payload.resourceMetrics).toBeDefined();

      const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
      const requestsTotal = metrics.find((m: any) => m.name === 'http_requests_total');
      expect(requestsTotal).toBeDefined();
      expect(requestsTotal.sum.dataPoints[0].asInt).toBe(1500);

      const memoryRss = metrics.find((m: any) => m.name === 'process_memory_rss_bytes');
      expect(memoryRss).toBeDefined();
      expect(memoryRss.gauge.dataPoints[0].asInt).toBe(125829120);
    });
  });
});
