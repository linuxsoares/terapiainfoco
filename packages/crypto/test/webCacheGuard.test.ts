/**
 * Testes Unitários do Motor de Proteção contra Web Cache Poisoning & Cache Deception
 * (RFC 7234, RFC 9111 & OWASP ASVS v4.0)
 */

import { describe, it, expect } from 'bun:test';
import {
  canonicalJsonStringify,
  normalizeHttpPath,
  normalizeCanonicalQuery,
  computeCanonicalCacheKey,
  detectCacheThreats,
  generateRecommendedCacheHeaders,
  createCacheProofSeal,
  verifyCacheProofSeal,
  inspectHttpRequestCache,
  DEFAULT_CACHE_GUARD_POLICY
} from '../src/webCacheGuard';
import {
  CacheThreatType,
  CacheThreatSeverity,
  CacheDirectiveAction,
  ResourceSensitivityLevel
} from '@terapiainfoco/shared';

describe('Web Cache Poisoning & Cache Deception Shield Engine', () => {
  describe('Serialização Canônica & Normalização de Caminhos HTTP', () => {
    it('deve gerar canonicalJsonStringify determinístico com chaves ordenadas', () => {
      const obj1 = { z: 10, a: 'primeiro', m: { b: 2, a: 1 } };
      const obj2 = { a: 'primeiro', m: { a: 1, b: 2 }, z: 10 };

      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    });

    it('deve normalizar slashes duplicados e dot-segments', () => {
      expect(normalizeHttpPath('//api///patients//123/')).toBe('/api/patients/123');
      expect(normalizeHttpPath('/api/v1/../patients/123')).toBe('/api/patients/123');
      expect(normalizeHttpPath('/static/css/../../api/patients')).toBe('/api/patients');
    });

    it('deve neutralizar delimitadores de matriz e semicolons de path-confusion', () => {
      expect(normalizeHttpPath('/api/patients/123;jsessionid=123456')).toBe('/api/patients/123');
      expect(normalizeHttpPath('/api/soap-notes;matrixParam=attack')).toBe('/api/soap-notes');
    });

    it('deve normalizar e ordenar parâmetros de query determinísticamente', () => {
      const q1 = normalizeCanonicalQuery('beta=2&alpha=1&charlie=3');
      const q2 = normalizeCanonicalQuery('charlie=3&alpha=1&beta=2');

      expect(q1).toBe('alpha=1&beta=2&charlie=3');
      expect(q1).toBe(q2);
      expect(normalizeCanonicalQuery('https://api.terapiainfoco.com.br/search?q=ansiedade&page=2')).toBe('page=2&q=ansiedade');
    });
  });

  describe('Geração Canônica de Cache Key (RFC 7234 / RFC 9111)', () => {
    it('deve gerar a mesma Cache Key para URLs semanticamente idênticas com queries desordenadas', () => {
      const headers = { 'Accept': 'application/json', 'Authorization': 'Bearer test-token' };

      const key1 = computeCanonicalCacheKey('GET', '/api/patients?b=2&a=1', headers, ResourceSensitivityLevel.CLINICAL_AUTHENTICATED);
      const key2 = computeCanonicalCacheKey('get', '//api//patients?a=1&b=2', headers, ResourceSensitivityLevel.CLINICAL_AUTHENTICATED);

      expect(key1.rawKeyString).toBe(key2.rawKeyString);
      expect(key1.normalizedPath).toBe('/api/patients');
      expect(key1.canonicalQuery).toBe('a=1&b=2');
    });

    it('deve alterar o hash da Cache Key se cabeçalhos chaveados sensíveis variarem', () => {
      const h1 = { 'Authorization': 'Bearer token-alice' };
      const h2 = { 'Authorization': 'Bearer token-bob' };

      const key1 = computeCanonicalCacheKey('GET', '/api/patients/me', h1, ResourceSensitivityLevel.CLINICAL_AUTHENTICATED);
      const key2 = computeCanonicalCacheKey('GET', '/api/patients/me', h2, ResourceSensitivityLevel.CLINICAL_AUTHENTICATED);

      expect(key1.keyedHeadersHash).not.toBe(key2.keyedHeadersHash);
    });
  });

  describe('Detecção de Ameaças: Web Cache Poisoning', () => {
    it('deve detectar injeção de cabeçalhos não-chaveados perigosos (X-Forwarded-Host)', () => {
      const headers = {
        'host': 'app.terapiainfoco.com.br',
        'x-forwarded-host': 'attacker-evil-host.com'
      };

      const result = detectCacheThreats(
        'GET',
        '/api/patients',
        headers,
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      );

      expect(result.threats.length).toBeGreaterThan(0);
      const threat = result.threats.find(t => t.threatType === CacheThreatType.UNKEYED_HEADER_INJECTION);
      expect(threat).toBeDefined();
      expect(threat?.triggerHeaderOrParam).toBe('x-forwarded-host');
      expect(result.headersToStrip).toContain('x-forwarded-host');
    });

    it('deve interceptar injeção de CRLF / Split-Request em valores de cabeçalhos', () => {
      const headers = {
        'x-custom-ref': 'legitimate\r\nInjected-Header: evil-payload'
      };

      const result = detectCacheThreats(
        'GET',
        '/api/public/terms',
        headers,
        ResourceSensitivityLevel.PUBLIC_STATIC
      );

      const splitThreat = result.threats.find(t => t.threatType === CacheThreatType.SPLIT_REQUEST_POISONING);
      expect(splitThreat).toBeDefined();
      expect(splitThreat?.severity).toBe(CacheThreatSeverity.CRITICAL);
      expect(splitThreat?.mitigationAction).toBe(CacheDirectiveAction.BLOCK_REQUEST);
    });

    it('deve detectar e mitigar tentativa de Method Override Poisoning', () => {
      const headers = {
        'x-http-method-override': 'DELETE'
      };

      const result = detectCacheThreats(
        'GET',
        '/api/patients/123',
        headers,
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      );

      const threat = result.threats.find(t => t.threatType === CacheThreatType.METHOD_OVERRIDE_POISONING);
      expect(threat).toBeDefined();
      expect(threat?.severity).toBe(CacheThreatSeverity.HIGH);
    });

    it('deve detectar Fat-GET poisoning com Content-Length ou payload no GET', () => {
      const headers = {
        'content-length': '128'
      };

      const result = detectCacheThreats(
        'GET',
        '/api/consultations',
        headers,
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED,
        undefined,
        '{"injectedParam": "poison"}'
      );

      const fatGetThreat = result.threats.find(t => t.threatType === CacheThreatType.FAT_GET_POISONING);
      expect(fatGetThreat).toBeDefined();
    });
  });

  describe('Detecção de Ameaças: Web Cache Deception', () => {
    it('deve detectar tentativa de Web Cache Deception em rota clínica com sufixo .css', () => {
      const url = '/api/patients/123/clinical-record.css';
      const headers = { 'accept': 'text/css,*/*' };

      const result = detectCacheThreats(
        'GET',
        url,
        headers,
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      );

      const deceptionThreat = result.threats.find(t => t.threatType === CacheThreatType.EXTENSION_CONFUSION_DECEPTION);
      expect(deceptionThreat).toBeDefined();
      expect(deceptionThreat?.severity).toBe(CacheThreatSeverity.CRITICAL);
      expect(deceptionThreat?.mitigationAction).toBe(CacheDirectiveAction.FORCE_NO_STORE);
    });

    it('deve detectar path traversal deception com dot-segments na URL', () => {
      const url = '/api/public/styles/../../patients/secret-notes';
      const headers = {};

      const result = detectCacheThreats(
        'GET',
        url,
        headers,
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      );

      const traversalThreat = result.threats.find(t => t.threatType === CacheThreatType.PATH_TRAVERSAL_DECEPTION);
      expect(traversalThreat).toBeDefined();
    });

    it('deve sinalizar query parameter flooding quando ultrapassa a política máxima', () => {
      const longQuery = Array.from({ length: 25 }, (_, i) => `p${i}=val${i}`).join('&');
      const url = `/api/patients?${longQuery}`;

      const result = detectCacheThreats(
        'GET',
        url,
        {},
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED,
        undefined,
        undefined,
        { ...DEFAULT_CACHE_GUARD_POLICY, maxQueryParameters: 15 }
      );

      const floodingThreat = result.threats.find(t => t.threatType === CacheThreatType.UNKEYED_PARAM_POISONING);
      expect(floodingThreat).toBeDefined();
    });
  });

  describe('Diretivas de Cabeçalho e Selagem Probatória WORM', () => {
    it('deve impor cabeçalhos rigorosos de NO-STORE para dados clínicos ou requisições sob ameaça', () => {
      const clinicalHeaders = generateRecommendedCacheHeaders(ResourceSensitivityLevel.CLINICAL_AUTHENTICATED, true, false);
      expect(clinicalHeaders.cacheControl).toContain('no-store');
      expect(clinicalHeaders.cacheControl).toContain('no-cache');
      expect(clinicalHeaders.cacheControl).toContain('private');
      expect(clinicalHeaders.pragma).toBe('no-cache');
      expect(clinicalHeaders.vary).toContain('Authorization');

      const publicHeaders = generateRecommendedCacheHeaders(ResourceSensitivityLevel.PUBLIC_STATIC, true, false);
      expect(publicHeaders.cacheControl).toContain('public');
      expect(publicHeaders.cacheControl).toContain('max-age=3600');
    });

    it('deve emitir e validar selo probatório RFC 8785 de Cache com HMAC-SHA256', () => {
      const seal = createCacheProofSeal('/api/patients/123', 'hash1234567890', 0, 'no-store, private');
      expect(seal.sealId).toStartWith('cache_guard_v1_');
      expect(seal.hmacSignature).toBeDefined();

      const verification = verifyCacheProofSeal(seal);
      expect(verification.isValid).toBe(true);
      expect(verification.parsedSeal?.resourceUri).toBe('/api/patients/123');
    });

    it('deve rejeitar selo adulterado ou assinado com chave inválida', () => {
      const seal = createCacheProofSeal('/api/patients/123', 'hash1234567890', 0, 'no-store, private');
      const tamperedSeal = { ...seal, threatsCount: 99 };

      const verification = verifyCacheProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('Assinatura HMAC');
    });

    it('deve inspecionar requisição ponta a ponta e produzir relatório consolidado', () => {
      const inspection = inspectHttpRequestCache(
        'GET',
        '/api/patients/456/notes.css',
        { 'host': 'app.terapiainfoco.com.br', 'x-forwarded-host': 'malicious.com' },
        ResourceSensitivityLevel.CLINICAL_AUTHENTICATED
      );

      expect(inspection.isSafe).toBe(false);
      expect(inspection.threats.length).toBe(2); // X-Forwarded-Host + Deception .css
      expect(inspection.recommendedCacheControl).toContain('no-store');
      expect(inspection.headersToStrip).toContain('x-forwarded-host');
      expect(inspection.seal.threatsCount).toBe(2);
    });
  });
});
