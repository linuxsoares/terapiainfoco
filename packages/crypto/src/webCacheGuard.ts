/**
 * ============================================================================
 * 63. MOTOR CRIPTOGRÁFICO & SANITIZADOR DE CACHE HTTP (RFC 7234, RFC 9111 & OWASP ASVS v4.0)
 * ============================================================================
 * 
 * Proteção avançada contra:
 * 1. Web Cache Poisoning (Injeção de cabeçalhos não-chaveados, HPP, CRLF, Fat-GET)
 * 2. Web Cache Deception (Confusão de extensões em rotas clínicas privadas / Path Traversal)
 * 3. Normalização canônica determinística de Cache Key com RFC 8785 (JCS)
 * 4. Emissão de Selo Probatório Notarial WORM com HMAC-SHA256
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  CacheThreatType,
  CacheThreatSeverity,
  CacheDirectiveAction,
  ResourceSensitivityLevel,
  type CacheKeyCanonicalComponents,
  type CacheThreatDetection,
  type CacheProofSeal,
  type CacheInspectionResult,
  type CacheGuardPolicy
} from '@terapiainfoco/shared';

/**
 * Chave mestra padrão para selagem probatória WORM de integridade de cache
 */
const DEFAULT_CACHE_SEAL_SECRET = process.env.CACHE_GUARD_SECRET || 'terapiainfoco_cache_guard_worm_secret_v1_2026';

/**
 * Política padrão de segurança de cache HTTP
 */
export const DEFAULT_CACHE_GUARD_POLICY: CacheGuardPolicy = {
  blockUnkeyedHeaders: true,
  enforceNoStoreOnClinical: true,
  blockStaticExtensionOnDynamicRoutes: true,
  allowedExtensionsOnDynamicRoutes: [],
  unkeyedHeadersBlacklist: [
    'x-forwarded-host',
    'x-forwarded-scheme',
    'x-forwarded-proto',
    'x-forwarded-prefix',
    'x-original-url',
    'x-rewrite-url',
    'x-host',
    'x-forwarded-port',
    'x-http-method-override',
    'x-method-override'
  ],
  enableCacheSignatureProof: true,
  maxQueryParameters: 20
};

/**
 * Extensões estáticas frequentemente exploradas em ataques de Web Cache Deception
 */
const DECEPTIVE_STATIC_EXTENSIONS = new Set([
  '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.webp', '.map', '.html', '.htm',
  '.txt', '.xml', '.json', '.webmanifest'
]);

/**
 * Prefixos de rotas clínicas altamente sensíveis
 */
const CLINICAL_DYNAMIC_ROUTE_PREFIXES = [
  '/api/patients',
  '/api/soap-notes',
  '/api/clinical-records',
  '/api/consultations',
  '/api/users',
  '/api/analytics',
  '/api/portability',
  '/api/documents',
  '/api/backup',
  '/api/court-order-threshold'
];

/**
 * Serialização Canônica Determinística RFC 8785 (JCS - JSON Canonicalization Scheme)
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(item => canonicalJsonStringify(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => {
    return `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`;
  });

  return `{${pairs.join(',')}}`;
}

/**
 * Normaliza um caminho HTTP removendo dot-segments, trailing slashes redundantes e path-confusion
 */
export function normalizeHttpPath(rawPath: string): string {
  if (!rawPath) return '/';

  let cleaned = rawPath.trim();

  // Remove matriz de parâmetros ou semicolons de path-confusion (ex: /path;jsessionid=...)
  const semicolonIdx = cleaned.indexOf(';');
  if (semicolonIdx !== -1) {
    cleaned = cleaned.substring(0, semicolonIdx);
  }

  // Decodifica %2e%2e e %2f de maneira controlada
  cleaned = cleaned.replace(/%2e/gi, '.').replace(/%2f/gi, '/');

  // Normaliza múltiplos slashes para um único
  cleaned = cleaned.replace(/\/+/g, '/');

  // Resolução canônica de dot-segments (RFC 3986 §5.2.4)
  const segments = cleaned.split('/');
  const resolvedSegments: string[] = [];

  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (resolvedSegments.length > 0) {
        resolvedSegments.pop();
      }
    } else {
      resolvedSegments.push(seg);
    }
  }

  const result = `/${resolvedSegments.join('/')}`;
  return result === '' ? '/' : result;
}

/**
 * Normaliza a Query String em pares chave-valor determinísticos ordenados alfabeticamente
 */
export function normalizeCanonicalQuery(rawUrlOrQuery: string): string {
  const queryIndex = rawUrlOrQuery.indexOf('?');
  const queryString = queryIndex !== -1 ? rawUrlOrQuery.substring(queryIndex + 1) : rawUrlOrQuery;

  if (!queryString || queryString === '' || !queryString.includes('=')) {
    return '';
  }

  // Remove fragmento de hash # se existir
  const hashIdx = queryString.indexOf('#');
  const cleanQuery = hashIdx !== -1 ? queryString.substring(0, hashIdx) : queryString;

  const pairs: Array<{ key: string; value: string }> = [];
  const parts = cleanQuery.split('&');

  for (const part of parts) {
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      pairs.push({ key: decodeURIComponent(part), value: '' });
    } else {
      const key = decodeURIComponent(part.substring(0, eqIdx));
      const value = decodeURIComponent(part.substring(eqIdx + 1));
      pairs.push({ key, value });
    }
  }

  // Ordena por chave e depois por valor
  pairs.sort((a, b) => {
    if (a.key === b.key) {
      return a.value.localeCompare(b.value);
    }
    return a.key.localeCompare(b.key);
  });

  return pairs.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
}

/**
 * Computa os componentes canônicos da Cache Key conforme RFC 7234 e RFC 9111
 */
export function computeCanonicalCacheKey(
  method: string,
  url: string,
  headers: Record<string, string>,
  sensitivity: ResourceSensitivityLevel
): CacheKeyCanonicalComponents {
  const normalizedMethod = method.toUpperCase();

  // Extrai pathname e query
  const queryIdx = url.indexOf('?');
  const rawPath = queryIdx !== -1 ? url.substring(0, queryIdx) : url;
  const rawQuery = queryIdx !== -1 ? url.substring(queryIdx + 1) : '';

  const normalizedPath = normalizeHttpPath(rawPath);
  const canonicalQuery = normalizeCanonicalQuery(rawQuery);

  // Computa hash determinístico dos cabeçalhos chaveados essenciais
  const keyedHeadersObj: Record<string, string> = {};
  const sensitiveKeyedHeaders = ['authorization', 'accept', 'accept-language', 'host'];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeyedHeaders.includes(lowerKey)) {
      keyedHeadersObj[lowerKey] = value.trim();
    }
  }

  const keyedHeadersCanonicalJson = canonicalJsonStringify(keyedHeadersObj);
  const keyedHeadersHash = createHash('sha256').update(keyedHeadersCanonicalJson).digest('hex').substring(0, 16);

  const rawKeyString = `CACHE_KEY_V1|${normalizedMethod}|${normalizedPath}|${canonicalQuery}|${keyedHeadersHash}|${sensitivity}`;

  return {
    method: normalizedMethod,
    normalizedPath,
    canonicalQuery,
    keyedHeadersHash,
    sensitivityLevel: sensitivity,
    rawKeyString
  };
}

/**
 * Analisa e detecta ameaças de Web Cache Poisoning e Web Cache Deception
 */
export function detectCacheThreats(
  method: string,
  url: string,
  headers: Record<string, string>,
  sensitivity: ResourceSensitivityLevel,
  expectedContentType?: string,
  bodyPayload?: string,
  policy: CacheGuardPolicy = DEFAULT_CACHE_GUARD_POLICY
): { threats: CacheThreatDetection[]; headersToStrip: string[] } {
  const threats: CacheThreatDetection[] = [];
  const headersToStrip: string[] = [];

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  // 1. Verificação de Injeção de CRLF / Split-Request nos cabeçalhos
  for (const [key, val] of Object.entries(lowerHeaders)) {
    if (/[\r\n]/.test(key) || /[\r\n]/.test(val)) {
      threats.push({
        threatType: CacheThreatType.SPLIT_REQUEST_POISONING,
        severity: CacheThreatSeverity.CRITICAL,
        description: 'Tentativa de injeção de CRLF (Carriage Return / Line Feed) detectada no cabeçalho HTTP.',
        triggerHeaderOrParam: key,
        evidence: `Valor do cabeçalho contém caracteres de quebra de linha maliciosos: ${JSON.stringify(val)}`,
        mitigationAction: CacheDirectiveAction.BLOCK_REQUEST
      });
      headersToStrip.push(key);
    }
  }

  // 2. Verificação de Cabeçalhos Não-Chaveados Perigosos (Unkeyed Headers Injection)
  for (const badHeader of policy.unkeyedHeadersBlacklist) {
    if (lowerHeaders[badHeader]) {
      const headerVal = lowerHeaders[badHeader];
      threats.push({
        threatType: CacheThreatType.UNKEYED_HEADER_INJECTION,
        severity: CacheThreatSeverity.HIGH,
        description: `Cabeçalho não-chaveado perigoso '${badHeader}' injetado para envenenamento de cache proxy reverso.`,
        triggerHeaderOrParam: badHeader,
        evidence: `Valor fornecido: '${headerVal}'. Pode manipular redirecionamentos ou host downstream.`,
        mitigationAction: CacheDirectiveAction.STRIP_UNKEYED_HEADERS
      });
      headersToStrip.push(badHeader);
    }
  }

  // 3. Verificação de Method Override Poisoning
  if (lowerHeaders['x-http-method-override'] || lowerHeaders['x-method-override']) {
    const overridden = lowerHeaders['x-http-method-override'] || lowerHeaders['x-method-override'];
    threats.push({
      threatType: CacheThreatType.METHOD_OVERRIDE_POISONING,
      severity: CacheThreatSeverity.HIGH,
      description: 'Tentativa de sobrescrita de método HTTP via cabeçalho mascarado (X-HTTP-Method-Override).',
      triggerHeaderOrParam: 'X-HTTP-Method-Override',
      evidence: `Tentativa de executar '${overridden}' via método base '${method}'.`,
      mitigationAction: CacheDirectiveAction.BLOCK_REQUEST
    });
  }

  // 4. Verificação de Fat-GET Poisoning
  const normalizedMethod = method.toUpperCase();
  if (['GET', 'HEAD'].includes(normalizedMethod)) {
    const hasContentLength = lowerHeaders['content-length'] && parseInt(lowerHeaders['content-length'], 10) > 0;
    const hasTransferEncoding = !!lowerHeaders['transfer-encoding'];
    const hasBody = !!bodyPayload && bodyPayload.trim().length > 0;

    if (hasContentLength || hasTransferEncoding || hasBody) {
      threats.push({
        threatType: CacheThreatType.FAT_GET_POISONING,
        severity: CacheThreatSeverity.MEDIUM,
        description: 'Requisição GET contendo payload ou cabeçalhos de corpo (Fat-GET) propensa a envenenamento.',
        triggerHeaderOrParam: 'Content-Length / Body',
        evidence: `Método ${normalizedMethod} fornecido com Content-Length ou payload de corpo.`,
        mitigationAction: CacheDirectiveAction.FORCE_NO_STORE
      });
    }
  }

  // 5. Verificação de Web Cache Deception (Extensão Estática em Rotas Dinâmicas Clínicas)
  const queryIdx = url.indexOf('?');
  const pathPart = queryIdx !== -1 ? url.substring(0, queryIdx) : url;
  const lowerPath = pathPart.toLowerCase();

  // Verifica se a rota é clínica ou se contém prefixo sensível
  const isClinicalRoute =
    sensitivity === ResourceSensitivityLevel.CLINICAL_AUTHENTICATED ||
    sensitivity === ResourceSensitivityLevel.ADMIN_GOVERNANCE ||
    CLINICAL_DYNAMIC_ROUTE_PREFIXES.some(prefix => lowerPath.startsWith(prefix));

  // Verifica confusão por sufixo de arquivo estático
  let matchedExtension: string | null = null;
  for (const ext of DECEPTIVE_STATIC_EXTENSIONS) {
    if (lowerPath.endsWith(ext) || lowerPath.includes(`${ext};`) || lowerPath.includes(`${ext}/`)) {
      matchedExtension = ext;
      break;
    }
  }

  if (isClinicalRoute && matchedExtension && policy.blockStaticExtensionOnDynamicRoutes) {
    threats.push({
      threatType: CacheThreatType.EXTENSION_CONFUSION_DECEPTION,
      severity: CacheThreatSeverity.CRITICAL,
      description: `Tentativa de Web Cache Deception detectada: sufixo estático '${matchedExtension}' acoplado a rota clínica privada.`,
      triggerHeaderOrParam: 'Path Extension',
      evidence: `Caminho '${pathPart}' solicita recurso sigiloso com extensão estática visando armazenamento em CDN pública.`,
      mitigationAction: CacheDirectiveAction.FORCE_NO_STORE
    });
  }

  // 6. Verificação de Path Traversal Deception (..%2f ou ..)
  if (pathPart.includes('/..') || pathPart.includes('..') || /%2e%2e/i.test(url)) {
    threats.push({
      threatType: CacheThreatType.PATH_TRAVERSAL_DECEPTION,
      severity: CacheThreatSeverity.HIGH,
      description: 'Dot-segments ou codificação de path traversal detectada na URL visando desvio de rota de cache.',
      triggerHeaderOrParam: 'URL Path',
      evidence: `Padrão de traversal detectado na URL: '${url}'.`,
      mitigationAction: CacheDirectiveAction.FORCE_NO_STORE
    });
  }

  // 7. Verificação de Limite de Parâmetros de Query (Query Flooding / Unkeyed Param Poisoning)
  if (queryIdx !== -1) {
    const rawQuery = url.substring(queryIdx + 1);
    const paramCount = rawQuery.split('&').filter(Boolean).length;
    if (paramCount > policy.maxQueryParameters) {
      threats.push({
        threatType: CacheThreatType.UNKEYED_PARAM_POISONING,
        severity: CacheThreatSeverity.MEDIUM,
        description: `Quantidade excessiva de parâmetros de query (${paramCount} > limite ${policy.maxQueryParameters}).`,
        triggerHeaderOrParam: 'Query String',
        evidence: `Flooding de parâmetros de query para exaustão de cache ou poluição de chaves.`,
        mitigationAction: CacheDirectiveAction.FORCE_NO_STORE
      });
    }
  }

  return { threats, headersToStrip };
}

/**
 * Gera cabeçalhos HTTP de controle de cache recomendados com base no nível de sensibilidade e ameaças
 */
export function generateRecommendedCacheHeaders(
  sensitivity: ResourceSensitivityLevel,
  isSafe: boolean,
  hasThreats: boolean
): {
  cacheControl: string;
  pragma: string;
  vary: string[];
} {
  // Recursos clínicos, confidenciais ou com ameaças devem ser estritamente NO-STORE
  if (
    !isSafe ||
    hasThreats ||
    sensitivity === ResourceSensitivityLevel.CLINICAL_AUTHENTICATED ||
    sensitivity === ResourceSensitivityLevel.ADMIN_GOVERNANCE ||
    sensitivity === ResourceSensitivityLevel.TELECONSULT_EPHEMERAL
  ) {
    return {
      cacheControl: 'no-store, no-cache, must-revalidate, private, max-age=0, s-maxage=0',
      pragma: 'no-cache',
      vary: ['Authorization', 'Accept', 'Accept-Encoding', 'Cookie']
    };
  }

  // Recursos estáticos públicos limpos
  return {
    cacheControl: 'public, max-age=3600, stale-while-revalidate=86400',
    pragma: 'cache',
    vary: ['Accept-Encoding']
  };
}

/**
 * Emite o Selo Probatório Canônico WORM RFC 8785 de Verificação de Cache
 */
export function createCacheProofSeal(
  resourceUri: string,
  canonicalCacheKeyHash: string,
  threatsCount: number,
  directive: string,
  secretKey: string = DEFAULT_CACHE_SEAL_SECRET
): CacheProofSeal {
  const timestamp = new Date().toISOString();

  const sealPayload = {
    version: '1.0.0' as const,
    resourceUri,
    canonicalCacheKeyHash,
    threatsCount,
    directive,
    timestamp
  };

  const canonicalString = canonicalJsonStringify(sealPayload);
  const hmacSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');
  const sealId = `cache_guard_v1_${hmacSignature.substring(0, 32)}`;

  return {
    version: '1.0.0',
    sealId,
    timestamp,
    resourceUri,
    canonicalCacheKeyHash,
    threatsCount,
    directive,
    hmacSignature
  };
}

/**
 * Valida a autenticidade e a não-adulteração de um Selo Probatório WORM de Cache
 */
export function verifyCacheProofSeal(
  seal: CacheProofSeal | string,
  secretKey: string = DEFAULT_CACHE_SEAL_SECRET
): { isValid: boolean; parsedSeal?: CacheProofSeal; reason?: string } {
  try {
    let parsed: CacheProofSeal;

    if (typeof seal === 'string') {
      const decoded = Buffer.from(seal, 'base64url').toString('utf-8');
      parsed = JSON.parse(decoded);
    } else {
      parsed = seal;
    }

    if (!parsed || parsed.version !== '1.0.0' || !parsed.hmacSignature || !parsed.sealId) {
      return { isValid: false, reason: 'Formato estrutural do selo de cache inválido.' };
    }

    const verificationPayload = {
      version: parsed.version,
      resourceUri: parsed.resourceUri,
      canonicalCacheKeyHash: parsed.canonicalCacheKeyHash,
      threatsCount: parsed.threatsCount,
      directive: parsed.directive,
      timestamp: parsed.timestamp
    };

    const canonicalString = canonicalJsonStringify(verificationPayload);
    const expectedSignature = createHmac('sha256', secretKey).update(canonicalString).digest('base64url');

    const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
    const actualBuf = Buffer.from(parsed.hmacSignature, 'utf-8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { isValid: false, reason: 'Assinatura HMAC do selo corrompida ou chave inválida.' };
    }

    return { isValid: true, parsedSeal: parsed };
  } catch (err: any) {
    return { isValid: false, reason: `Falha na verificação criptográfica: ${err.message}` };
  }
}

/**
 * Executa a inspeção completa de uma requisição contra Web Cache Poisoning & Cache Deception
 */
export function inspectHttpRequestCache(
  method: string,
  url: string,
  headers: Record<string, string>,
  sensitivity: ResourceSensitivityLevel,
  expectedContentType?: string,
  bodyPayload?: string,
  policy: CacheGuardPolicy = DEFAULT_CACHE_GUARD_POLICY,
  secretKey: string = DEFAULT_CACHE_SEAL_SECRET
): CacheInspectionResult {
  // 1. Computa componentes canônicos da Cache Key
  const components = computeCanonicalCacheKey(method, url, headers, sensitivity);
  const canonicalCacheKeyHash = createHash('sha256').update(components.rawKeyString).digest('hex');

  // 2. Analisa vetores de ameaça
  const { threats, headersToStrip } = detectCacheThreats(
    method,
    url,
    headers,
    sensitivity,
    expectedContentType,
    bodyPayload,
    policy
  );

  const isSafe = threats.length === 0;

  // 3. Determina diretivas de cabeçalho recomendadas
  const recommended = generateRecommendedCacheHeaders(sensitivity, isSafe, threats.length > 0);

  // 4. Emite selo probatório WORM
  const seal = createCacheProofSeal(
    url,
    canonicalCacheKeyHash,
    threats.length,
    recommended.cacheControl,
    secretKey
  );

  return {
    isSafe,
    canonicalCacheKey: components.rawKeyString,
    canonicalCacheKeyHash,
    components,
    threats,
    recommendedCacheControl: recommended.cacheControl,
    recommendedPragma: recommended.pragma,
    recommendedVary: recommended.vary,
    headersToStrip,
    seal
  };
}
