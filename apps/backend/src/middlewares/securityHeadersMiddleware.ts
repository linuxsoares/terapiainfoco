import type { MiddlewareHandler } from 'hono';
import { RECOMMENDED_SECURITY_HEADERS } from '@terapiainfoco/crypto';

/**
 * Middleware global de Hardening de Cabeçalhos HTTP de Segurança (RFC-001 §4.4, §5.2)
 * Injeta cabeçalhos padrão OWASP contra XSS, Clickjacking, MIME Confusion e Man-In-The-Middle.
 */
export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Injeta cabeçalhos de segurança recomendados na resposta HTTP
    for (const [header, spec] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
      c.header(header, spec.value);
    }
  };
}
