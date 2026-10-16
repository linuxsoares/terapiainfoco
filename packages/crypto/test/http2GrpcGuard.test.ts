import { describe, it, expect, beforeEach } from 'bun:test';
import {
  Http2GrpcGuardEngine,
  DEFAULT_HTTP2_POLICY,
  SAMPLE_HTTP2_ATTACKS,
  SAMPLE_BENIGN_HTTP2_SUITES,
  canonicalStringify
} from '../src/http2GrpcGuard';
import {
  Http2RiskSeverity,
  Http2ThreatCategory,
  Http2ValidationAction,
  Http2ProtocolTarget
} from '@terapiainfoco/shared';

describe('HTTP/2 & gRPC Header Injection & Smuggling Guard (RFC 9113, CWE-113, CWE-444)', () => {
  let engine: Http2GrpcGuardEngine;

  beforeEach(() => {
    engine = new Http2GrpcGuardEngine();
  });

  describe('1. Conformidade com a RFC 9113 em Requisições Benignas', () => {
    it('deve aprovar com ALLOW a suíte REST clínica normal', () => {
      const suite = SAMPLE_BENIGN_HTTP2_SUITES[0];
      const result = engine.inspectHeaders(suite.headers, suite.protocolTarget);

      expect(result.isValid).toBe(true);
      expect(result.action).toBe(Http2ValidationAction.ALLOW);
      expect(result.threats.length).toBe(0);
      expect(result.sanitizedHeaders.length).toBe(suite.headers.length);
      expect(result.seal).toBeDefined();
      expect(result.seal?.sealToken.startsWith('h2_desync_seal_')).toBe(true);
    });

    it('deve aprovar com ALLOW a suíte gRPC com trailers e timeout válido', () => {
      const suite = SAMPLE_BENIGN_HTTP2_SUITES[1];
      const result = engine.inspectHeaders(suite.headers, suite.protocolTarget);

      expect(result.isValid).toBe(true);
      expect(result.action).toBe(Http2ValidationAction.ALLOW);
      expect(result.threats.length).toBe(0);
      expect(result.seal?.protocolTarget).toBe(Http2ProtocolTarget.GRPC_STREAM);
    });

    it('deve aprovar com ALLOW a sinalização WebRTC sobre HTTP/2', () => {
      const suite = SAMPLE_BENIGN_HTTP2_SUITES[2];
      const result = engine.inspectHeaders(suite.headers, suite.protocolTarget);

      expect(result.isValid).toBe(true);
      expect(result.action).toBe(Http2ValidationAction.ALLOW);
    });
  });

  describe('2. Detecção de HTTP/2 to HTTP/1.1 Request Smuggling (H2.TE & H2.CL)', () => {
    it('deve bloquear imediatamente requisições HTTP/2 contendo transfer-encoding (RFC 9113 §8.2.2)', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.H2_TE_SMUGGLING];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.H2_TE_SMUGGLING)).toBe(true);
      expect(result.threats.some((t) => t.severity === Http2RiskSeverity.CRITICAL)).toBe(true);
    });

    it('deve bloquear cabeçalho TE com valor diferente de trailers (ex: te: chunked)', () => {
      const headers = [
        { name: ':method', value: 'POST' },
        { name: ':path', value: '/api/clinical-records' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' },
        { name: 'te', value: 'chunked' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.H2_TE_SMUGGLING)).toBe(true);
    });

    it('deve bloquear Content-Length múltiplo e conflitante (H2.CL Desync)', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH)).toBe(true);
    });

    it('deve bloquear Content-Length com valor negativo ou não-numérico', () => {
      const headers = [
        { name: ':method', value: 'POST' },
        { name: ':path', value: '/api/patients' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' },
        { name: 'content-length', value: '-15' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.AMBIGUOUS_CONTENT_LENGTH)).toBe(true);
    });
  });

  describe('3. Prevenção de CRLF Injection & HTTP Request/Response Splitting (CWE-113)', () => {
    it('deve detectar e bloquear sequências CRLF em cabeçalho authorization', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.CRLF_HEADER_SPLIT];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.CRLF_HEADER_SPLIT)).toBe(true);
      expect(result.threats.some((t) => t.severity === Http2RiskSeverity.CRITICAL)).toBe(true);
    });

    it('deve detectar e bloquear CRLF injetado no nome de cabeçalho', () => {
      const headers = [
        { name: ':method', value: 'GET' },
        { name: ':path', value: '/api/test' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' },
        { name: 'x-injected\r\nevil', value: 'payload' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.CRLF_HEADER_SPLIT)).toBe(true);
    });
  });

  describe('4. Validação Estrita de Pseudo-Cabeçalhos HTTP/2', () => {
    it('deve detectar pseudo-cabeçalhos arbitrários não autorizados (:x-admin-role)', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.PSEUDO_HEADER_INJECTION];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.PSEUDO_HEADER_INJECTION)).toBe(true);
    });

    it('deve detectar pseudo-cabeçalho posicionado após cabeçalhos normais', () => {
      const headers = [
        { name: ':method', value: 'GET' },
        { name: 'user-agent', value: 'Mozilla/5.0' },
        { name: ':path', value: '/api/records' } // Ilegal segundo RFC 9113 §8.3
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.description.includes('precedam todos os campos normais'))).toBe(true);
    });

    it('deve bloquear :path vazio', () => {
      const headers = [
        { name: ':method', value: 'GET' },
        { name: ':path', value: '   ' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.description.includes(':path'))).toBe(true);
    });

    it('deve bloquear Null Byte Injection no :path', () => {
      const headers = [
        { name: ':method', value: 'GET' },
        { name: ':path', value: '/api/patients\0/secret' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.isValid).toBe(false);
      expect(result.action).toBe(Http2ValidationAction.BLOCK_AND_ISOLATE);
      expect(result.threats.some((t) => t.description.includes('Byte nulo'))).toBe(true);
    });
  });

  describe('5. Cabeçalhos Hop-by-Hop e Caixa Alta', () => {
    it('deve bloquear ou sanitizar cabeçalhos proibidos de conexão (Connection, Upgrade)', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.threats.some((t) => t.category === Http2ThreatCategory.CONNECTION_SPECIFIC_HEADER)).toBe(true);
    });

    it('deve acusar violação de caixa alta na RFC 9113 §8.2.1 e normalizar em minúsculas', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.threats.some((t) => t.category === Http2ThreatCategory.INVALID_CHARACTER_NAME_VALUE)).toBe(true);
      expect(result.sanitizedHeaders.some((h) => h.name === 'x-therapist-crp')).toBe(true);
    });
  });

  describe('6. Validação de Metadados gRPC', () => {
    it('deve bloquear grpc-timeout com formato malformado', () => {
      const attack = SAMPLE_HTTP2_ATTACKS[Http2ThreatCategory.GRPC_HEADER_TAMPERING];
      const result = engine.inspectHeaders(attack.headers, attack.protocolTarget);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.category === Http2ThreatCategory.GRPC_HEADER_TAMPERING)).toBe(true);
    });

    it('deve bloquear grpc-encoding não homologado', () => {
      const headers = [
        { name: ':method', value: 'POST' },
        { name: ':path', value: '/terapiainfoco.Service/Call' },
        { name: ':authority', value: 'grpc.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' },
        { name: 'content-type', value: 'application/grpc' },
        { name: 'grpc-encoding', value: 'malicious-compressor-xyz' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.GRPC_STREAM);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.description.includes('Codificação de compressão gRPC não homologada'))).toBe(true);
    });

    it('deve aceitar grpc-timeout legítimo (10S, 500m, 1H)', () => {
      const headers = [
        { name: ':method', value: 'POST' },
        { name: ':path', value: '/terapiainfoco.Service/Call' },
        { name: ':authority', value: 'grpc.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' },
        { name: 'content-type', value: 'application/grpc' },
        { name: 'te', value: 'trailers' },
        { name: 'grpc-timeout', value: '500m' }
      ];
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.GRPC_STREAM);

      expect(result.isValid).toBe(true);
      expect(result.threats.length).toBe(0);
    });
  });

  describe('7. Selagem Probatória Notarial WORM RFC 8785 (JCS) HMAC-SHA256', () => {
    it('deve gerar canonicalStringify determinística independente da ordenação de chaves', () => {
      const obj1 = { b: 2, a: 1, c: { y: 20, x: 10 } };
      const obj2 = { a: 1, c: { x: 10, y: 20 }, b: 2 };

      expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
    });

    it('deve emitir e validar com 100% de sucesso um selo notarial autêntico', () => {
      const suite = SAMPLE_BENIGN_HTTP2_SUITES[0];
      const result = engine.inspectHeaders(suite.headers, suite.protocolTarget);
      expect(result.seal).toBeDefined();

      const verification = engine.verifySeal(result.seal!);
      expect(verification.isValid).toBe(true);
      expect(verification.message).toContain('autêntica e íntegra');
    });

    it('deve acusar fraude se a assinatura HMAC ou headersHash forem adulterados', () => {
      const suite = SAMPLE_BENIGN_HTTP2_SUITES[0];
      const result = engine.inspectHeaders(suite.headers, suite.protocolTarget);
      const forgedSeal = {
        ...result.seal!,
        headersHash: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      const verification = engine.verifySeal(forgedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.message).toContain('Falha na validação criptográfica');
    });
  });

  describe('8. Governança & Atualização de Políticas', () => {
    it('deve permitir atualizar parâmetros da política em tempo de execução', () => {
      engine.updatePolicy({ maxTotalHeadersCount: 3 });
      expect(engine.getPolicy().maxTotalHeadersCount).toBe(3);

      const headers = [
        { name: ':method', value: 'GET' },
        { name: ':path', value: '/api/test' },
        { name: ':authority', value: 'api.terapiainfoco.com.br' },
        { name: ':scheme', value: 'https' }
      ]; // 4 cabeçalhos > 3
      const result = engine.inspectHeaders(headers, Http2ProtocolTarget.HTTP2_REST);

      expect(result.threats.some((t) => t.offendingHeader === 'TOTAL_HEADERS_COUNT')).toBe(true);
    });
  });
});
