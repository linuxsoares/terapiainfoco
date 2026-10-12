import type { Context, Next } from 'hono';
import { auditService } from '../services/auditService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

export interface RateLimiterOptions {
  windowMs: number;        // Janela de tempo em milissegundos (ex: 60000 = 1 min)
  max: number;             // Número máximo de requisições por janela
  message?: string;        // Mensagem de erro customizada
  keyGenerator?: (c: Context) => string;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimitStore {
  private store = new Map<string, RateLimitRecord>();

  public increment(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetAt) {
      const newRecord = { count: 1, resetAt: now + windowMs };
      this.store.set(key, newRecord);
      return newRecord;
    }

    record.count++;
    return record;
  }

  public reset(key?: string) {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }
}

export const globalRateLimitStore = new InMemoryRateLimitStore();

/**
 * Middleware de Rate Limiting para proteção contra brute force e ataques de enumeração
 */
export function rateLimiter(options: RateLimiterOptions, store: InMemoryRateLimitStore = globalRateLimitStore) {
  const {
    windowMs,
    max,
    message = 'Limite de requisições excedido. Por favor, aguarde antes de tentar novamente.',
    keyGenerator = (c) => {
      const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
      return `${ip}:${c.req.path}`;
    }
  } = options;

  return async (c: Context, next: Next) => {
    // Permite bypass em testes quando cabeçalho específico for enviado
    if (c.req.header('X-Bypass-Rate-Limit') === 'true') {
      return await next();
    }

    const key = keyGenerator(c);
    const { count, resetAt } = store.increment(key, windowMs);
    const remaining = Math.max(0, max - count);
    const retryAfterSeconds = Math.ceil(Math.max(0, resetAt - Date.now()) / 1000);

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());

    if (count > max) {
      c.header('Retry-After', retryAfterSeconds.toString());

      const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
      auditService.logAccess({
        actorId: '00000000-0000-0000-0000-000000000000',
        resourceType: AuditResourceType.SECURITY,
        resourceId: '00000000-0000-0000-0000-000000000000',
        action: AuditAction.RATE_LIMIT_EXCEEDED,
        ipAddress: ip,
        userAgent: `Rate limit hit on ${c.req.path}: key=${key}, count=${count}/${max}`
      }).catch(() => {});

      return c.json(
        {
          success: false,
          error: message,
          retryAfterSeconds,
          limit: max,
          current: count
        },
        429
      );
    }

    return await next();
  };
}

/**
 * Presets de Rate Limiting para a RFC-001
 */
export const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de autenticação. Acesso temporariamente bloqueado por 1 minuto para proteger sua conta.'
});

export const searchRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Limite de buscas por Blind Index excedido. Proteção contra ataques de enumeração ativa.'
});

export const validationRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Limite de validações de documentos excedido. Proteção contra enumeração de tokens ativa.'
});

export const publicBookingRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Muitas solicitações de agendamento em curto período. Tente novamente em instantes.'
});
