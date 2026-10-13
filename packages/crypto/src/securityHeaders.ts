import type {
  SecurityHeaderCheck,
  SecurityHeadersEvaluationResult
} from '@terapiainfoco/shared';

/**
 * Padrão ouro de cabeçalhos de segurança HTTP recomendados pela OWASP Secure Headers Project
 * e alinhados à RFC-001 §4.4 e §5.2.
 */
export const RECOMMENDED_SECURITY_HEADERS: Record<string, { value: string; recommendation: string }> = {
  'content-security-policy': {
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    recommendation: 'Restringe origens confiáveis para scripts, estilos e conexões, mitigando ataques de XSS e Data Injection.'
  },
  'strict-transport-security': {
    value: 'max-age=31536000; includeSubDomains; preload',
    recommendation: 'Força comunicação estrita via HTTPS com proteção HSTS de 1 ano contra ataques Man-In-The-Middle e SSL Stripping.'
  },
  'x-content-type-options': {
    value: 'nosniff',
    recommendation: 'Impede o navegador de realizar MIME-sniffing em respostas, prevenindo execução de payloads maliciosos disfarçados.'
  },
  'x-frame-options': {
    value: 'DENY',
    recommendation: 'Proíbe a renderização da aplicação dentro de frames/iframes, protegendo contra Clickjacking.'
  },
  'x-xss-protection': {
    value: '0',
    recommendation: 'Desativa o filtro legado de XSS do navegador (recomendação OWASP) para evitar vulnerabilidades de sanitização reflexiva.'
  },
  'referrer-policy': {
    value: 'strict-origin-when-cross-origin',
    recommendation: 'Protege identificadores de sessão e dados de prontuário contra vazamentos acidentais no cabeçalho Referer.'
  },
  'permissions-policy': {
    value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
    recommendation: 'Habilita câmera e microfone exclusivamente para telepsicologia (CFP nº 011/2018) e bloqueia APIs não utilizadas.'
  },
  'cross-origin-opener-policy': {
    value: 'same-origin',
    recommendation: 'Isola o contexto de navegação contra ataques de vazamento de janelas cruzadas (Spectre mitigation).'
  },
  'cross-origin-resource-policy': {
    value: 'same-origin',
    recommendation: 'Bloqueia o carregamento de recursos da API por origens externas não autorizadas.'
  }
};

/**
 * Padrões de rotas armadilha (Honeypot Anti-Probe & Reconnaissance)
 * Usados por scanners automatizados (e.g., ZAP, Nikto, Shodan, scripts maliciosos)
 */
export const HONEYPOT_PROBE_PATTERNS: RegExp[] = [
  /^\/\.env(\..+)?$/i,
  /^\/\.git(\/.*)?$/i,
  /^\/\.aws(\/.*)?$/i,
  /^\/\.vscode(\/.*)?$/i,
  /^\/\.idea(\/.*)?$/i,
  /^\/wp-admin(\/.*)?$/i,
  /^\/wp-login\.php$/i,
  /^\/xmlrpc\.php$/i,
  /^\/phpmyadmin(\/.*)?$/i,
  /^\/pma(\/.*)?$/i,
  /^\/actuator(\/.*)?$/i,
  /^\/solr(\/.*)?$/i,
  /^\/shell(\/.*)?$/i,
  /^\/cgi-bin(\/.*)?$/i,
  /^\/config\.json$/i,
  /^\/setup\.php$/i,
  /^\/server-status$/i,
  /^\/swagger-ui\.html$/i
];

/**
 * Avalia se o caminho solicitado corresponde a um probe ou scanner malicioso
 */
export function isHoneypotProbePath(path: string): boolean {
  if (!path) return false;
  const cleanPath = path.split('?')[0].trim();
  return HONEYPOT_PROBE_PATTERNS.some((pattern) => pattern.test(cleanPath));
}

/**
 * Avalia a conformidade dos cabeçalhos HTTP respondidos contra a matriz OWASP
 */
export function evaluateSecurityHeaders(
  headers: Record<string, string | string[] | undefined> | Headers
): SecurityHeadersEvaluationResult {
  const evaluatedAt = new Date().toISOString();
  const checks: SecurityHeaderCheck[] = [];

  // Converte cabeçalhos para mapa normalizado em minúsculas
  const headerMap = new Map<string, string>();
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      headerMap.set(key.toLowerCase(), value);
    });
  } else if (headers && typeof headers === 'object') {
    for (const [key, val] of Object.entries(headers)) {
      if (val !== undefined && val !== null) {
        headerMap.set(key.toLowerCase(), Array.isArray(val) ? val.join(', ') : String(val));
      }
    }
  }

  let totalPassed = 0;
  const targetHeaders = Object.keys(RECOMMENDED_SECURITY_HEADERS);

  for (const headerKey of targetHeaders) {
    const spec = RECOMMENDED_SECURITY_HEADERS[headerKey];
    const actualValue = headerMap.get(headerKey);
    const present = Boolean(actualValue);

    let status: 'PASS' | 'WARN' | 'FAIL' = 'FAIL';

    if (present && actualValue) {
      if (headerKey === 'strict-transport-security') {
        status = actualValue.includes('max-age') ? 'PASS' : 'WARN';
      } else if (headerKey === 'content-security-policy') {
        status = actualValue.includes("default-src") ? 'PASS' : 'WARN';
      } else if (headerKey === 'permissions-policy') {
        status = actualValue.includes('camera') && actualValue.includes('microphone') ? 'PASS' : 'WARN';
      } else if (actualValue.toLowerCase() === spec.value.toLowerCase()) {
        status = 'PASS';
      } else {
        status = 'WARN';
      }
    }

    if (status === 'PASS') {
      totalPassed++;
    }

    checks.push({
      header: headerKey,
      expectedValue: spec.value,
      actualValue,
      present,
      status,
      recommendation: spec.recommendation
    });
  }

  const scorePercentage = Math.round((totalPassed / targetHeaders.length) * 100);

  let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F';
  if (scorePercentage === 100) {
    grade = 'A+';
  } else if (scorePercentage >= 85) {
    grade = 'A';
  } else if (scorePercentage >= 70) {
    grade = 'B';
  } else if (scorePercentage >= 50) {
    grade = 'C';
  } else {
    grade = 'F';
  }

  return {
    evaluatedAt,
    scorePercentage,
    grade,
    checks,
    totalPassed,
    totalChecks: targetHeaders.length
  };
}
