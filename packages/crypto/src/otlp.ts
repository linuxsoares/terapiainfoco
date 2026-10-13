import type { TraceSpan } from '@terapiainfoco/shared';
import { OtlpExporterProvider } from '@terapiainfoco/shared';

export interface OtlpServiceMetadata {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
}

/**
 * Converte valor de atributo para o formato fortemente tipado do OTLP JSON
 */
export function formatOtlpAttributeValue(val: string | number | boolean): Record<string, any> {
  if (typeof val === 'boolean') {
    return { boolValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { intValue: val };
    }
    return { doubleValue: val };
  }
  return { stringValue: String(val) };
}

/**
 * Mapeia o SpanKind para os códigos numéricos da especificação OTLP
 * 1 = INTERNAL, 2 = SERVER, 3 = CLIENT, 4 = PRODUCER, 5 = CONSUMER
 */
export function mapSpanKindToOtlp(kind?: string): number {
  switch (kind?.toUpperCase()) {
    case 'SERVER':
      return 2;
    case 'CLIENT':
      return 3;
    case 'PRODUCER':
      return 4;
    case 'CONSUMER':
      return 5;
    case 'INTERNAL':
    default:
      return 1;
  }
}

/**
 * Monta os cabeçalhos HTTP necessários para autenticação no coletor remoto
 */
export function buildOtlpHeaders(
  provider: OtlpExporterProvider,
  apiKey?: string,
  customHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'TerapiaInFoco-OTel/1.0'
  };

  if (apiKey && apiKey.trim()) {
    const key = apiKey.trim();
    switch (provider) {
      case OtlpExporterProvider.DATADOG:
        headers['dd-api-key'] = key;
        break;
      case OtlpExporterProvider.NEW_RELIC:
        headers['api-key'] = key;
        break;
      case OtlpExporterProvider.DYNATRACE:
        headers['Authorization'] = `Api-Token ${key}`;
        break;
      case OtlpExporterProvider.GENERIC_COLLECTOR:
      case OtlpExporterProvider.CUSTOM:
      default:
        headers['Authorization'] = `Bearer ${key}`;
        break;
    }
  }

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  return headers;
}

/**
 * Valida a URL do coletor remoto OTLP
 */
export function validateOtlpEndpoint(endpoint?: string): { valid: boolean; error?: string } {
  if (!endpoint || !endpoint.trim()) {
    return { valid: false, error: 'O endpoint OTLP não pode ser vazio.' };
  }

  try {
    const url = new URL(endpoint.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Protocolo inválido. Deve ser http:// ou https://' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL do endpoint OTLP malformatada.' };
  }
}

/**
 * Resolve as URLs completas de traces e metrics por provedor
 */
export function resolveOtlpEndpoint(
  provider: OtlpExporterProvider,
  configuredEndpoint?: string
): { tracesUrl: string; metricsUrl: string } {
  let base = (configuredEndpoint || '').trim();

  if (!base) {
    switch (provider) {
      case OtlpExporterProvider.DATADOG:
        base = 'https://otlp.datadoghq.com';
        break;
      case OtlpExporterProvider.NEW_RELIC:
        base = 'https://otlp.nr-data.net:4318';
        break;
      case OtlpExporterProvider.DYNATRACE:
        base = 'https://live.dynatrace.com/api/v2/otlp';
        break;
      case OtlpExporterProvider.GENERIC_COLLECTOR:
      case OtlpExporterProvider.CUSTOM:
      default:
        base = 'http://localhost:4318';
        break;
    }
  }

  // Remove trailing slashes
  base = base.replace(/\/+$/, '');

  // Se já apontar diretamente para /v1/traces
  if (base.endsWith('/v1/traces')) {
    const root = base.replace(/\/v1\/traces$/, '');
    return {
      tracesUrl: base,
      metricsUrl: `${root}/v1/metrics`
    };
  }

  if (base.endsWith('/v1/metrics')) {
    const root = base.replace(/\/v1\/metrics$/, '');
    return {
      tracesUrl: `${root}/v1/traces`,
      metricsUrl: base
    };
  }

  return {
    tracesUrl: `${base}/v1/traces`,
    metricsUrl: `${base}/v1/metrics`
  };
}

/**
 * Formata lote de Spans conforme especificação OTLP JSON v1 (ExportTraceServiceRequest)
 */
export function formatOtlpTracesPayload(
  spans: TraceSpan[],
  metadata?: OtlpServiceMetadata
): Record<string, any> {
  const serviceName = metadata?.serviceName || 'terapiainfoco-backend';
  const serviceVersion = metadata?.serviceVersion || '1.0.0';
  const environment = metadata?.environment || 'production';

  const resourceAttributes = [
    { key: 'service.name', value: { stringValue: serviceName } },
    { key: 'service.version', value: { stringValue: serviceVersion } },
    { key: 'deployment.environment', value: { stringValue: environment } },
    { key: 'telemetry.sdk.name', value: { stringValue: 'opentelemetry' } },
    { key: 'telemetry.sdk.language', value: { stringValue: 'typescript' } }
  ];

  const formattedSpans = spans.map((span) => {
    const startMs = BigInt(span.startTimeMs);
    const endMs = BigInt(span.endTimeMs || (span.startTimeMs + (span.durationMs || 0)));

    const attributes = Object.entries(span.attributes || {}).map(([key, value]) => ({
      key,
      value: formatOtlpAttributeValue(value)
    }));

    const events = (span.events || []).map((evt) => ({
      name: evt.name,
      timeUnixNano: String(BigInt(evt.timestampMs) * 1000000n),
      attributes: Object.entries(evt.attributes || {}).map(([k, v]) => ({
        key: k,
        value: formatOtlpAttributeValue(v)
      }))
    }));

    const isError = span.status === 'ERROR';
    const errorMessage = span.attributes?.['error.message'];

    return {
      traceId: span.traceId,
      spanId: span.spanId,
      ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
      name: span.name,
      kind: mapSpanKindToOtlp(span.kind),
      startTimeUnixNano: String(startMs * 1000000n),
      endTimeUnixNano: String(endMs * 1000000n),
      attributes,
      events,
      status: {
        code: isError ? 2 : 1,
        ...(errorMessage ? { message: String(errorMessage) } : {})
      }
    };
  });

  return {
    resourceSpans: [
      {
        resource: {
          attributes: resourceAttributes
        },
        scopeSpans: [
          {
            scope: {
              name: '@terapiainfoco/telemetry',
              version: '1.0.0'
            },
            spans: formattedSpans
          }
        ]
      }
    ]
  };
}

/**
 * Formata métricas consolidadas conforme especificação OTLP JSON v1 (ExportMetricsServiceRequest)
 */
export function formatOtlpMetricsPayload(
  metricsSnapshot: any,
  metadata?: OtlpServiceMetadata
): Record<string, any> {
  const serviceName = metadata?.serviceName || 'terapiainfoco-backend';
  const serviceVersion = metadata?.serviceVersion || '1.0.0';
  const environment = metadata?.environment || 'production';
  const nowNanos = String(BigInt(Date.now()) * 1000000n);

  const resourceAttributes = [
    { key: 'service.name', value: { stringValue: serviceName } },
    { key: 'service.version', value: { stringValue: serviceVersion } },
    { key: 'deployment.environment', value: { stringValue: environment } }
  ];

  const metrics: any[] = [];

  // Red Metrics (Requests total, Errors, In Flight)
  if (metricsSnapshot?.red) {
    metrics.push({
      name: 'http_requests_total',
      description: 'Total de requisições HTTP recebidas',
      unit: '1',
      sum: {
        aggregationTemporality: 2, // CUMULATIVE
        isMonotonic: true,
        dataPoints: [
          {
            timeUnixNano: nowNanos,
            asInt: metricsSnapshot.red.totalRequests || 0
          }
        ]
      }
    });

    metrics.push({
      name: 'http_errors_total',
      description: 'Total de erros HTTP (4xx / 5xx)',
      unit: '1',
      sum: {
        aggregationTemporality: 2,
        isMonotonic: true,
        dataPoints: [
          {
            timeUnixNano: nowNanos,
            asInt: metricsSnapshot.red.errorCount || 0
          }
        ]
      }
    });
  }

  // Crypto Metrics
  if (metricsSnapshot?.crypto) {
    metrics.push({
      name: 'crypto_operations_total',
      description: 'Total de operações criptográficas FLE e Blind Indexing',
      unit: '1',
      sum: {
        aggregationTemporality: 2,
        isMonotonic: true,
        dataPoints: [
          {
            timeUnixNano: nowNanos,
            asInt: metricsSnapshot.crypto.totalOperations || 0
          }
        ]
      }
    });
  }

  // System Gauges (Memory RSS)
  if (metricsSnapshot?.system?.processMemoryRssBytes) {
    metrics.push({
      name: 'process_memory_rss_bytes',
      description: 'Memória RSS consumida pelo processo Bun',
      unit: 'By',
      gauge: {
        dataPoints: [
          {
            timeUnixNano: nowNanos,
            asInt: metricsSnapshot.system.processMemoryRssBytes
          }
        ]
      }
    });
  }

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: resourceAttributes
        },
        scopeMetrics: [
          {
            scope: {
              name: '@terapiainfoco/telemetry',
              version: '1.0.0'
            },
            metrics
          }
        ]
      }
    ]
  };
}
