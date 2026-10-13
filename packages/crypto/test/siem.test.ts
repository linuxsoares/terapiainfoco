import { describe, it, expect } from 'bun:test';
import {
  formatDatadogPayload,
  formatSplunkPayload,
  formatElasticPayload,
  formatGenericWebhookPayload,
  formatSiemPayload,
  buildSiemHeaders,
  calculateExponentialBackoff
} from '../src/siem';

describe('SIEM Adapters & Resilient Exponential Backoff Engine (RFC §4.4 & §5.2)', () => {
  const sampleAuditData = {
    actorId: 'usr-admin-01',
    action: 'SECURITY_ALERT',
    ipAddress: '189.120.45.67',
    detail: 'Múltiplas tentativas de acesso suspeitas bloqueadas por rate limit.'
  };

  describe('formatDatadogPayload', () => {
    it('deve formatar evento conforme o schema v2 da API de Logs do Datadog', () => {
      const payload = formatDatadogPayload('SECURITY_ALERT', sampleAuditData, {
        tags: { cluster: 'sa-east-1', team: 'secops' }
      });

      expect(payload.ddsource).toBe('terapiainfoco');
      expect(payload.service).toBe('terapiainfoco-clinical');
      expect(payload.hostname).toBe('api.terapiainfoco.com.br');
      expect(payload.status).toBe('error');
      expect(payload.ddtags).toContain('cluster:sa-east-1');
      expect(payload.ddtags).toContain('team:secops');
      expect(payload.ddtags).toContain('compliance:lgpd-art-48');
      expect(payload.audit.eventType).toBe('SECURITY_ALERT');
      expect(payload.audit.data.actorId).toBe('usr-admin-01');
    });

    it('deve definir status "info" para eventos não críticos', () => {
      const payload = formatDatadogPayload('DOCUMENT_SIGNED', { docId: 'doc-123' });
      expect(payload.status).toBe('info');
    });
  });

  describe('formatSplunkPayload', () => {
    it('deve formatar payload no padrão Splunk HEC (HTTP Event Collector)', () => {
      const payload = formatSplunkPayload('AUTH_LOGIN_FAILED', sampleAuditData, {
        index: 'security_audit',
        sourcetype: 'terapiainfoco:json'
      });

      expect(payload.time).toBeGreaterThan(0);
      expect(payload.host).toBe('api.terapiainfoco.com.br');
      expect(payload.source).toBe('terapiainfoco-audit-worm');
      expect(payload.sourcetype).toBe('terapiainfoco:json');
      expect(payload.index).toBe('security_audit');
      expect(payload.event.eventType).toBe('AUTH_LOGIN_FAILED');
      expect(payload.event.compliance).toContain('LGPD Art. 48');
      expect(payload.event.payload.ipAddress).toBe('189.120.45.67');
    });
  });

  describe('formatElasticPayload', () => {
    it('deve formatar documento conforme o Elastic Common Schema (ECS 8.11.0)', () => {
      const payload = formatElasticPayload('DATA_EXPORT_LGPD', sampleAuditData);

      expect(payload['@timestamp']).toBeDefined();
      expect(payload.ecs.version).toBe('8.11.0');
      expect(payload.event.action).toBe('DATA_EXPORT_LGPD');
      expect(payload.tags).toContain('lgpd-art-48');
      expect(payload.log.level).toBe('info');
      expect(payload.terapiainfoco.actorId).toBe('usr-admin-01');
    });
  });

  describe('formatGenericWebhookPayload & formatSiemPayload', () => {
    it('deve gerar payload genérico estruturado com ID único e conformidade', () => {
      const payload = formatGenericWebhookPayload('CONSENT_REVOKED', { patientId: 'p-1' });

      expect(payload.id).toStartWith('del-');
      expect(payload.event).toBe('CONSENT_REVOKED');
      expect(payload.compliance).toContain('LGPD Art. 48');
      expect(payload.data.patientId).toBe('p-1');
    });

    it('deve despachar corretamente entre provedores via formatSiemPayload', () => {
      const dd = formatSiemPayload('datadog', 'SECURITY_ALERT', sampleAuditData);
      expect(dd.ddsource).toBe('terapiainfoco');

      const sp = formatSiemPayload('splunk', 'SECURITY_ALERT', sampleAuditData);
      expect(sp.sourcetype).toBe('_json');

      const el = formatSiemPayload('elastic', 'SECURITY_ALERT', sampleAuditData);
      expect(el.ecs).toBeDefined();

      const gen = formatSiemPayload('generic', 'SECURITY_ALERT', sampleAuditData);
      expect(gen.id).toBeDefined();
    });
  });

  describe('buildSiemHeaders', () => {
    it('deve gerar cabeçalho DD-API-KEY para Datadog', () => {
      const headers = buildSiemHeaders('datadog', 'dd-secret-api-key-12345');
      expect(headers['DD-API-KEY']).toBe('dd-secret-api-key-12345');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('deve formatar prefixo Splunk para HEC se ausente', () => {
      const headers = buildSiemHeaders('splunk', 'token-hec-abcdef');
      expect(headers['Authorization']).toBe('Splunk token-hec-abcdef');
    });

    it('deve preservar prefixo Splunk se já presente', () => {
      const headers = buildSiemHeaders('splunk', 'Splunk token-hec-abcdef');
      expect(headers['Authorization']).toBe('Splunk token-hec-abcdef');
    });

    it('deve gerar cabeçalho ApiKey para Elasticsearch', () => {
      const headers = buildSiemHeaders('elastic', 'elastic-key-789');
      expect(headers['Authorization']).toBe('ApiKey elastic-key-789');
    });
  });

  describe('calculateExponentialBackoff', () => {
    it('deve retornar atraso base na primeira tentativa (attempt 1)', () => {
      const delay = calculateExponentialBackoff(1, 1000);
      expect(delay).toBe(1000);
    });

    it('deve dobrar exponencialmente o atraso em tentativas subsequentes sem jitter', () => {
      // randomMock = 0.5 gera jitter 0: (0.5 * 2 - 1) * 0.2 * base = 0
      const delay2 = calculateExponentialBackoff(2, 1000, 30000, 0.2, 0.5);
      expect(delay2).toBe(2000);

      const delay3 = calculateExponentialBackoff(3, 1000, 30000, 0.2, 0.5);
      expect(delay3).toBe(4000);

      const delay4 = calculateExponentialBackoff(4, 1000, 30000, 0.2, 0.5);
      expect(delay4).toBe(8000);

      const delay5 = calculateExponentialBackoff(5, 1000, 30000, 0.2, 0.5);
      expect(delay5).toBe(16000);
    });

    it('deve respeitar o teto máximo maxDelayMs', () => {
      const delayCap = calculateExponentialBackoff(10, 1000, 15000, 0.2, 0.5);
      expect(delayCap).toBe(15000);
    });

    it('deve aplicar variação de jitter dentro do limite configurado', () => {
      // randomMock = 1.0 gera jitter máximo (+20%)
      const delayMaxJitter = calculateExponentialBackoff(2, 1000, 30000, 0.2, 1.0);
      expect(delayMaxJitter).toBe(2400); // 2000 + 20% = 2400

      // randomMock = 0.0 gera jitter mínimo (-20%)
      const delayMinJitter = calculateExponentialBackoff(2, 1000, 30000, 0.2, 0.0);
      expect(delayMinJitter).toBe(1600); // 2000 - 20% = 1600
    });
  });
});
