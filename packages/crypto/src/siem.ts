import { randomUUID } from 'node:crypto';
import type { SiemProvider } from '@terapiainfoco/shared';

export interface SiemFormattingOptions {
  index?: string;
  source?: string;
  sourcetype?: string;
  tags?: Record<string, string>;
  host?: string;
}

/**
 * Formata evento de auditoria/segurança para a API de Logs v2 do Datadog
 */
export function formatDatadogPayload(
  eventType: string,
  data: any,
  options?: SiemFormattingOptions
): Record<string, any> {
  const mergedTags = {
    env: 'production',
    service: 'clinical-platform',
    compliance: 'lgpd-art-48',
    cfp: 'cfp-001-2009',
    ...(options?.tags || {})
  };

  const ddtags = Object.entries(mergedTags)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');

  const isError = eventType === 'SECURITY_ALERT' || eventType === 'AUTH_LOGIN_FAILED';

  return {
    ddsource: 'terapiainfoco',
    ddtags,
    hostname: options?.host || 'api.terapiainfoco.com.br',
    service: 'terapiainfoco-clinical',
    message: `[LGPD / CFP SIEM Audit] ${eventType}`,
    timestamp: Date.now(),
    status: isError ? 'error' : 'info',
    audit: {
      eventType,
      data
    }
  };
}

/**
 * Formata evento de auditoria/segurança para o Splunk HEC (HTTP Event Collector)
 */
export function formatSplunkPayload(
  eventType: string,
  data: any,
  options?: SiemFormattingOptions
): Record<string, any> {
  return {
    time: Math.floor(Date.now() / 1000),
    host: options?.host || 'api.terapiainfoco.com.br',
    source: options?.source || 'terapiainfoco-audit-worm',
    sourcetype: options?.sourcetype || '_json',
    index: options?.index || 'main',
    event: {
      eventType,
      compliance: 'LGPD Art. 48 & CFP 001/2009',
      timestamp: new Date().toISOString(),
      payload: data
    }
  };
}

/**
 * Formata evento de auditoria/segurança para a API de Indexação do Elasticsearch (ECS 8.11.0)
 */
export function formatElasticPayload(
  eventType: string,
  data: any,
  options?: SiemFormattingOptions
): Record<string, any> {
  const isError = eventType === 'SECURITY_ALERT' || eventType === 'AUTH_LOGIN_FAILED';

  return {
    '@timestamp': new Date().toISOString(),
    ecs: { version: '8.11.0' },
    log: {
      level: isError ? 'error' : 'info'
    },
    event: {
      action: eventType,
      category: ['authentication', 'iam', 'audit', 'compliance'],
      dataset: 'terapiainfoco.security',
      kind: isError ? 'alert' : 'event'
    },
    tags: ['terapiainfoco', 'lgpd-art-48', 'cfp-001-2009'],
    host: {
      name: options?.host || 'api.terapiainfoco.com.br'
    },
    terapiainfoco: data
  };
}

/**
 * Formata evento no formato genérico padrão de Webhook
 */
export function formatGenericWebhookPayload(
  eventType: string,
  data: any
): Record<string, any> {
  return {
    id: `del-${randomUUID()}`,
    event: eventType,
    timestamp: new Date().toISOString(),
    compliance: 'LGPD Art. 48 & Resoluções CFP',
    data
  };
}

/**
 * Roteador central de formatação conforme o provedor SIEM
 */
export function formatSiemPayload(
  provider: SiemProvider,
  eventType: string,
  data: any,
  options?: SiemFormattingOptions
): Record<string, any> {
  switch (provider) {
    case 'datadog':
      return formatDatadogPayload(eventType, data, options);
    case 'splunk':
      return formatSplunkPayload(eventType, data, options);
    case 'elastic':
      return formatElasticPayload(eventType, data, options);
    case 'generic':
    default:
      return formatGenericWebhookPayload(eventType, data);
  }
}

/**
 * Constrói os cabeçalhos HTTP específicos exigidos por cada conector SIEM
 */
export function buildSiemHeaders(
  provider: SiemProvider,
  apiKey?: string,
  customHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'TerapiaInFoco-SIEM-Dispatcher/1.0',
    ...(customHeaders || {})
  };

  if (!apiKey) {
    return headers;
  }

  const cleanKey = apiKey.trim();

  switch (provider) {
    case 'datadog':
      headers['DD-API-KEY'] = cleanKey;
      break;
    case 'splunk':
      headers['Authorization'] = cleanKey.startsWith('Splunk ') ? cleanKey : `Splunk ${cleanKey}`;
      break;
    case 'elastic':
      headers['Authorization'] = cleanKey.startsWith('ApiKey ') || cleanKey.startsWith('Bearer ') || cleanKey.startsWith('Basic ')
        ? cleanKey
        : `ApiKey ${cleanKey}`;
      break;
    case 'generic':
    default:
      headers['X-API-Key'] = cleanKey;
      break;
  }

  return headers;
}

/**
 * Calcula o atraso em milissegundos usando Exponential Backoff com Jitter
 * delay = min(baseDelay * 2^(attempt - 1), maxDelay) + jitter
 *
 * @param attempt Número da tentativa atual (1, 2, 3...)
 * @param baseDelayMs Atraso base em milissegundos (padrão 1.000ms = 1s)
 * @param maxDelayMs Atraso teto em milissegundos (padrão 30.000ms = 30s)
 * @param jitterFactor Fator de variação pseudo-aleatória (padrão ±20%)
 * @param randomMock Semente opcional para testes unitários determinísticos (0.0 a 1.0)
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  jitterFactor = 0.2,
  randomMock?: number
): number {
  if (attempt <= 1) {
    return baseDelayMs;
  }

  // Base exponencial: 1s, 2s, 4s, 8s, 16s...
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);

  // Jitter para evitar "thundering herd"
  const rand = randomMock !== undefined ? randomMock : Math.random();
  const jitter = (rand * 2 - 1) * jitterFactor * capped;

  return Math.max(100, Math.round(capped + jitter));
}
