import { describe, it, expect } from 'bun:test';
import {
  parseRawQueryString,
  detectHttpParameterPollution,
  detectHeaderInjection,
  sanitizeHeaderValue,
  createHttpGuardProofSeal,
  verifyHttpGuardProofSeal
} from '../src/httpSecurityGuard';
import {
  HppAttackCategory,
  HppSeverityLevel
} from '@terapiainfoco/shared';

describe('HTTP Security Guard — Blindagem contra HPP e Injeção de Cabeçalhos (CRLF)', () => {
  describe('parseRawQueryString', () => {
    it('deve parsear parâmetros simples corretamente', () => {
      const parsed = parseRawQueryString('?name=Joao&city=SP');
      expect(parsed).toEqual({
        name: ['Joao'],
        city: ['SP']
      });
    });

    it('deve agrupar múltiplos parâmetros com a mesma chave em arrays', () => {
      const parsed = parseRawQueryString('patientId=100&patientId=200&patientId=300&status=active');
      expect(parsed.patientId).toEqual(['100', '200', '300']);
      expect(parsed.status).toEqual(['active']);
    });

    it('deve lidar com query strings vazias', () => {
      expect(parseRawQueryString('')).toEqual({});
      expect(parseRawQueryString('?')).toEqual({});
    });
  });

  describe('detectHttpParameterPollution (HPP)', () => {
    it('deve retornar isPolluted=false para requisições limpas sem repetição', () => {
      const result = detectHttpParameterPollution('patientId=paciente_123&action=consult&startDate=2026-10-15');
      expect(result.isPolluted).toBe(false);
      expect(result.violations.length).toBe(0);
      expect(result.severity).toBe(HppSeverityLevel.LOW);
      expect(result.canonicalParams.patientId).toBe('paciente_123');
    });

    it('deve detectar poluição em parâmetros comuns e aplicar severidade MEDIUM', () => {
      const result = detectHttpParameterPollution('sortBy=name&sortBy=date');
      expect(result.isPolluted).toBe(true);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].parameterName).toBe('sortBy');
      expect(result.violations[0].count).toBe(2);
      expect(result.canonicalParams.sortBy).toBe('name'); // Mantém o primeiro
      expect(result.severity).toBe(HppSeverityLevel.MEDIUM);
    });

    it('deve elevar severidade para CRITICAL quando parâmetros clínicos/de controle são poluídos', () => {
      const result = detectHttpParameterPollution('patientId=valid_id&patientId=evil_id&role=PSICOLOGO_TITULAR&role=ADMIN');
      expect(result.isPolluted).toBe(true);
      expect(result.severity).toBe(HppSeverityLevel.CRITICAL);
      expect(result.violations.length).toBe(2);
      expect(result.violations.some((v) => v.parameterName === 'patientId')).toBe(true);
      expect(result.violations.some((v) => v.parameterName === 'role')).toBe(true);
    });

    it('deve respeitar a lista branca de parâmetros com múltiplos valores legítimos', () => {
      const result = detectHttpParameterPollution('tags=terapia&tags=ansiedade&tags=tcc&patientId=abc', ['tags']);
      expect(result.isPolluted).toBe(false);
      expect(result.violations.length).toBe(0);
      expect(result.canonicalParams.tags).toBe('terapia');
    });

    it('deve aceitar instâncias de URLSearchParams', () => {
      const searchParams = new URLSearchParams();
      searchParams.append('id', '1');
      searchParams.append('id', '2');
      const result = detectHttpParameterPollution(searchParams);
      expect(result.isPolluted).toBe(true);
      expect(result.violations[0].parameterName).toBe('id');
    });
  });

  describe('detectHeaderInjection & CRLF Defense', () => {
    it('deve aprovar cabeçalhos HTTP legítimos sem caracteres maliciosos', () => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://terapiainfoco.com.br/dashboard'
      };
      const result = detectHeaderInjection(headers);
      expect(result.hasInjection).toBe(false);
      expect(result.violations.length).toBe(0);
      expect(result.severity).toBe(HppSeverityLevel.LOW);
    });

    it('deve detectar injeção direta de CRLF (\\r\\n) em cabeçalho HTTP', () => {
      const headers = {
        'X-Custom-Header': 'valid_value\r\nX-Injected-Header: evil'
      };
      const result = detectHeaderInjection(headers);
      expect(result.hasInjection).toBe(true);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0].injectionType).toBe(HppAttackCategory.CRLF_HEADER_INJECTION);
      expect(result.sanitizedHeaders['X-Custom-Header']).toBe('valid_value X-Injected-Header: evil');
    });

    it('deve detectar tentativa de Cookie Poisoning com Set-Cookie injetado', () => {
      const headers = {
        'Location': '/login%0d%0aSet-Cookie: session_hijack=malicious_token; Path=/; Secure'
      };
      const result = detectHeaderInjection(headers);
      expect(result.hasInjection).toBe(true);
      expect(result.violations[0].injectionType).toBe(HppAttackCategory.COOKIE_POISONING);
      expect(result.severity).toBe(HppSeverityLevel.CRITICAL);
    });

    it('deve detectar HTTP Response Splitting com payload HTML', () => {
      const headers = {
        'X-Forwarded-Host': 'terapiainfoco.com.br%0d%0a%0d%0a<html><body><h1>Defaced</h1></body></html>'
      };
      const result = detectHeaderInjection(headers);
      expect(result.hasInjection).toBe(true);
      expect(result.violations[0].injectionType).toBe(HppAttackCategory.HTTP_RESPONSE_SPLITTING);
      expect(result.severity).toBe(HppSeverityLevel.CRITICAL);
    });

    it('deve detectar tentativa de injeção de Byte Nulo (%00 ou \\0)', () => {
      const headers = {
        'Content-Disposition': 'attachment; filename="prontuario.pdf%00.exe"'
      };
      const result = detectHeaderInjection(headers);
      expect(result.hasInjection).toBe(true);
      expect(result.violations[0].injectionType).toBe(HppAttackCategory.NULL_BYTE_INJECTION);
      expect(result.sanitizedHeaders['Content-Disposition']).toBe('attachment; filename="prontuario.pdf.exe"');
    });
  });

  describe('sanitizeHeaderValue', () => {
    it('deve neutralizar quebras de linha e caracteres maliciosos', () => {
      const raw = 'safe_prefix\r\n\n%0d%0aInjected%00_suffix';
      const clean = sanitizeHeaderValue(raw);
      expect(clean).not.toContain('\r');
      expect(clean).not.toContain('\n');
      expect(clean).not.toContain('%0d');
      expect(clean).not.toContain('%0a');
      expect(clean).not.toContain('%00');
    });
  });

  describe('createHttpGuardProofSeal & verifyHttpGuardProofSeal', () => {
    it('deve gerar selo probatório com HMAC-SHA256 e validar com sucesso', () => {
      const incidentData = {
        incidentId: 'inc_test_12345',
        timestamp: '2026-10-15T14:00:00.000Z',
        targetEndpoint: '/api/clinical-records/export',
        category: HppAttackCategory.HTTP_PARAMETER_POLLUTION,
        details: 'Duplicação maliciosa de patientId detectada e bloqueada',
        clientIp: '189.40.22.15'
      };

      const seal = createHttpGuardProofSeal(incidentData);
      expect(seal.token).toMatch(/^seal_http_guard_/);
      expect(seal.canonicalDigest).toBeDefined();
      expect(seal.hmacSignature).toBeDefined();

      const isValid = verifyHttpGuardProofSeal(seal, incidentData);
      expect(isValid).toBe(true);
    });

    it('deve reprovar a verificação se os dados do incidente forem alterados retroativamente', () => {
      const incidentData = {
        incidentId: 'inc_test_12345',
        timestamp: '2026-10-15T14:00:00.000Z',
        targetEndpoint: '/api/clinical-records/export',
        category: HppAttackCategory.HTTP_PARAMETER_POLLUTION,
        details: 'Duplicação maliciosa de patientId detectada e bloqueada',
        clientIp: '189.40.22.15'
      };

      const seal = createHttpGuardProofSeal(incidentData);

      // Adulteração do IP ou do endpoint
      const tamperedData = {
        ...incidentData,
        clientIp: '200.150.10.99'
      };

      const isValid = verifyHttpGuardProofSeal(seal, tamperedData);
      expect(isValid).toBe(false);
    });

    it('deve reprovar se a assinatura HMAC for adulterada', () => {
      const incidentData = {
        incidentId: 'inc_test_99999',
        timestamp: '2026-10-15T14:05:00.000Z',
        targetEndpoint: '/api/auth/2fa/verify',
        category: HppAttackCategory.CRLF_HEADER_INJECTION,
        details: 'Tentativa de injeção CRLF em Location',
        clientIp: '177.18.99.1'
      };

      const seal = createHttpGuardProofSeal(incidentData);
      const forgedSeal = {
        ...seal,
        hmacSignature: seal.hmacSignature.replace(/a/g, 'b')
      };

      expect(verifyHttpGuardProofSeal(forgedSeal, incidentData)).toBe(false);
    });
  });
});
