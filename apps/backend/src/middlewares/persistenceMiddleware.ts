import type { MiddlewareHandler } from 'hono';
import { persistence } from '../db/memoryDb';

/**
 * Garante que as mutações feitas durante a requisição estejam gravadas no PostgreSQL
 * antes da resposta ser enviada (ADR-004). Se a gravação falhar, a resposta original
 * é substituída por 503 para que o cliente não receba uma confirmação falsa.
 */
export function persistenceMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (!persistence.enabled) return;
    try {
      await persistence.flush();
    } catch (err) {
      console.error('❌ Falha ao gravar mudanças da requisição no PostgreSQL:', err);
      c.res = c.json({
        success: false,
        error: 'Falha ao salvar os dados. A operação não foi confirmada; tente novamente em instantes.'
      }, 503);
    }
  };
}
