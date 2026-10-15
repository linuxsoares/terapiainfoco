/**
 * Motor de Blindagem contra Ataques de Poluição de Parâmetros HTTP (HPP) & Injeção de Cabeçalhos (CRLF)
 * Alinhado a OWASP Top 10 API Security, OWASP ASVS v4.0 e RFC-001 §4.4, §5.2.
 */

import crypto from 'crypto';
import {
  HppAttackCategory,
  HppDefensePolicy,
  HppSeverityLevel,
  type HppParameterViolation,
  type HppInspectionResult,
  type HeaderInjectionViolation,
  type HeaderInjectionInspectionResult,
  type HttpGuardProofSeal
} from '@terapiainfoco/shared';

// Segredo mestre para selos probatórios de segurança HTTP
const HTTP_GUARD_SECRET = process.env.HTTP_GUARD_SECRET || 'terapiainfoco_http_guard_notary_secret_key_2026';

// Lista de parâmetros de altíssima sensibilidade clínica e regulatória
export const CRITICAL_CLINICAL_PARAMS = [
  'patientid',
  'cpf',
  'therapistid',
  'userrole',
  'role',
  'token',
  'sessiontoken',
  'documentid',
  'action',
  'admin',
  'isadmin',
  'consentstatus',
  'status',
  'redirect'
];

// Padrões maliciosos de CRLF, Response Splitting e Byte Nulo em Cabeçalhos
const CRLF_PATTERNS: Array<{ regex: RegExp; type: HppAttackCategory; description: string; score: number }> = [
  {
    regex: /(\r\n|\n|\r|%0d%0a|%0a|%0d|\\r\\n|\\r|\\n).*(set-cookie|cookie|location|x-forwarded|content-type|transfer-encoding):/i,
    type: HppAttackCategory.COOKIE_POISONING,
    description: 'Injeção de cabeçalhos de autenticação/cookie ou redirecionamento via CRLF',
    score: 95
  },
  {
    regex: /(\r\n\r\n|%0d%0a%0d%0a|\\r\\n\\r\\n|%0a%0a|%0d%0d).*(<html|<body|HTTP\/1\.[01]|\{"|\{)/i,
    type: HppAttackCategory.HTTP_RESPONSE_SPLITTING,
    description: 'HTTP Response Splitting detectado com tentativa de injeção de corpo de resposta',
    score: 100
  },
  {
    regex: /(\r\n|\n|\r|%0d%0a|%0a|%0d|\\r\\n|\\r|\\n)/i,
    type: HppAttackCategory.CRLF_HEADER_INJECTION,
    description: 'Caracteres de quebra de linha CRLF injetados em cabeçalho HTTP',
    score: 85
  },
  {
    regex: /(%00|\\0|\\u0000|\x00)/i,
    type: HppAttackCategory.NULL_BYTE_INJECTION,
    description: 'Byte nulo injetado para contorno de extensões ou filtros de terminação de string',
    score: 90
  }
];

/**
 * Normaliza e parseia query strings brutas preservando todas as ocorrências de chaves repetidas
 */
export function parseRawQueryString(rawQuery: string): Record<string, string[]> {
  const cleanQuery = rawQuery.startsWith('?') ? rawQuery.substring(1) : rawQuery;
  const result: Record<string, string[]> = {};

  if (!cleanQuery.trim()) {
    return result;
  }

  const pairs = cleanQuery.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const [rawKey, rawVal = ''] = pair.split('=');
    const key = decodeURIComponent(rawKey.trim());
    const val = decodeURIComponent(rawVal.trim());

    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(val);
  }

  return result;
}

/**
 * Inspeciona parâmetros HTTP em busca de poluição maliciosa (HTTP Parameter Pollution - HPP)
 */
export function detectHttpParameterPollution(
  input: string | Record<string, string | string[] | undefined> | URLSearchParams,
  allowedMultiParams: string[] = ['tags', 'filter', 'scopes', 'ids']
): HppInspectionResult {
  const allowedSet = new Set(allowedMultiParams.map((p) => p.toLowerCase()));
  const violations: HppParameterViolation[] = [];
  const canonicalParams: Record<string, string> = {};

  let parsed: Record<string, string[]> = {};

  if (typeof input === 'string') {
    parsed = parseRawQueryString(input);
  } else if (input instanceof URLSearchParams) {
    for (const [key, val] of input.entries()) {
      if (!parsed[key]) parsed[key] = [];
      parsed[key].push(val);
    }
  } else {
    for (const [key, val] of Object.entries(input)) {
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        parsed[key] = val;
      } else {
        parsed[key] = [val];
      }
    }
  }

  let maxScore = 0;

  for (const [key, values] of Object.entries(parsed)) {
    const lowerKey = key.toLowerCase();
    const isAllowed = allowedSet.has(lowerKey);

    // Canônico padrão: retém sempre a primeira ocorrência
    canonicalParams[key] = values[0] || '';

    if (values.length > 1 && !isAllowed) {
      const isCritical = CRITICAL_CLINICAL_PARAMS.includes(lowerKey);
      const score = isCritical ? 90 : 50;
      if (score > maxScore) maxScore = score;

      violations.push({
        parameterName: key,
        values,
        count: values.length,
        source: 'QUERY',
        remediation: isCritical
          ? `Parâmetro clínico/de controle '${key}' foi fornecido ${values.length} vezes. Rejeição compulsória contra bypass de RBAC/auditoria.`
          : `Parâmetro '${key}' duplicado. Removidas ocorrências redundantes retendo '${values[0]}'.`
      });
    }
  }

  let severity = HppSeverityLevel.LOW;
  if (maxScore >= 85) {
    severity = HppSeverityLevel.CRITICAL;
  } else if (maxScore >= 65) {
    severity = HppSeverityLevel.HIGH;
  } else if (maxScore >= 40) {
    severity = HppSeverityLevel.MEDIUM;
  }

  return {
    isPolluted: violations.length > 0,
    severity,
    violations,
    canonicalParams,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Inspeciona cabeçalhos HTTP em busca de injeções de CRLF, Response Splitting e Bytes Nulos
 */
export function detectHeaderInjection(
  headers: Record<string, string | undefined> | [string, string][] | Headers
): HeaderInjectionInspectionResult {
  const violations: HeaderInjectionViolation[] = [];
  const sanitizedHeaders: Record<string, string> = {};

  const entries: [string, string][] = [];

  if (Array.isArray(headers)) {
    entries.push(...headers);
  } else if (headers instanceof Headers) {
    headers.forEach((val, key) => entries.push([key, val]));
  } else {
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) entries.push([k, v]);
    }
  }

  let maxScore = 0;

  for (const [headerName, rawValue] of entries) {
    let hasViolation = false;

    for (const pattern of CRLF_PATTERNS) {
      if (pattern.regex.test(rawValue)) {
        hasViolation = true;
        if (pattern.score > maxScore) maxScore = pattern.score;

        violations.push({
          headerName,
          rawHeaderValue: rawValue,
          sanitizedHeaderValue: sanitizeHeaderValue(rawValue),
          detectedPattern: pattern.regex.toString(),
          injectionType: pattern.type,
          severity:
            pattern.score >= 90
              ? HppSeverityLevel.CRITICAL
              : pattern.score >= 70
              ? HppSeverityLevel.HIGH
              : HppSeverityLevel.MEDIUM,
          remediation: pattern.description
        });
        break;
      }
    }

    sanitizedHeaders[headerName] = sanitizeHeaderValue(rawValue);
  }

  let severity = HppSeverityLevel.LOW;
  if (maxScore >= 90) {
    severity = HppSeverityLevel.CRITICAL;
  } else if (maxScore >= 70) {
    severity = HppSeverityLevel.HIGH;
  } else if (maxScore >= 40) {
    severity = HppSeverityLevel.MEDIUM;
  }

  return {
    hasInjection: violations.length > 0,
    severity,
    violations,
    sanitizedHeaders,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Remove caracteres de controle, quebras de linha e bytes nulos de valores de cabeçalhos
 */
export function sanitizeHeaderValue(value: string): string {
  if (!value) return '';

  return value
    .replace(/%0d%0a|%0D%0A|\\r\\n/gi, ' ')
    .replace(/%0a|%0d|%0A|%0D|\\r|\\n/gi, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/(%00|\\0|\\u0000|\x00)/gi, '')
    .trim();
}

/**
 * Cria um selo criptográfico auditável (WORM Proof Seal) para registro do incidente
 */
export function createHttpGuardProofSeal(params: {
  incidentId: string;
  timestamp: string;
  targetEndpoint: string;
  category: HppAttackCategory;
  details: string;
  clientIp: string;
}): HttpGuardProofSeal {
  const canonicalData = [
    params.incidentId,
    params.timestamp,
    params.targetEndpoint,
    params.category,
    params.clientIp,
    params.details
  ].join('|');

  const canonicalDigest = crypto.createHash('sha256').update(canonicalData).digest('hex');
  const hmacSignature = crypto.createHmac('sha256', HTTP_GUARD_SECRET).update(canonicalDigest).digest('hex');
  const token = `seal_http_guard_${params.incidentId.replace(/-/g, '').substring(0, 12)}_${canonicalDigest.substring(0, 16)}`;

  return {
    token,
    incidentId: params.incidentId,
    timestamp: params.timestamp,
    canonicalDigest,
    hmacSignature,
    issuer: 'TerapiaInFoco HTTP Security Guard Engine RFC-001',
    targetEndpoint: params.targetEndpoint
  };
}

/**
 * Valida a autenticidade e integridade forense de um selo emitido
 */
export function verifyHttpGuardProofSeal(
  seal: HttpGuardProofSeal,
  expectedIncidentData?: {
    incidentId: string;
    timestamp: string;
    targetEndpoint: string;
    category: HppAttackCategory;
    details: string;
    clientIp: string;
  }
): boolean {
  if (!seal || !seal.canonicalDigest || !seal.hmacSignature) {
    return false;
  }

  const expectedHmac = crypto.createHmac('sha256', HTTP_GUARD_SECRET).update(seal.canonicalDigest).digest('hex');
  if (seal.hmacSignature !== expectedHmac) {
    return false;
  }

  if (expectedIncidentData) {
    const canonicalData = [
      expectedIncidentData.incidentId,
      expectedIncidentData.timestamp,
      expectedIncidentData.targetEndpoint,
      expectedIncidentData.category,
      expectedIncidentData.clientIp,
      expectedIncidentData.details
    ].join('|');

    const expectedDigest = crypto.createHash('sha256').update(canonicalData).digest('hex');
    if (seal.canonicalDigest !== expectedDigest) {
      return false;
    }
  }

  return true;
}
