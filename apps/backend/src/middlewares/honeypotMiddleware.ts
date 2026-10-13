import type { MiddlewareHandler } from 'hono';
import { isHoneypotProbePath } from '@terapiainfoco/crypto';
import { honeypotService } from '../services/honeypotService';

/**
 * Middleware de Honeypot & Proteção Ativa Anti-Reconhecimento (RFC-001 §4.4, §5.2)
 * Detecta scanners automatizados, bloqueia IPs maliciosos e registra violações na trilha WORM.
 */
export function honeypotMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const rawIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const clientIp = rawIp.split(',')[0].trim();
    const path = c.req.path;

    // 1. Verifica se o IP requisitante já está com banimento ativo em quarentena
    if (honeypotService.isIpBanned(clientIp)) {
      honeypotService.recordBlockedAttempt(clientIp);
      return c.json({
        success: false,
        error: 'Acesso bloqueado: Este endereço IP encontra-se em quarentena por detecção prévia de probe malicioso (RFC-001 §4.4).',
        code: 'IP_QUARANTINED'
      }, 403);
    }

    // 2. Verifica se o caminho solicitado corresponde a um probe ou scanner de vulnerabilidades
    if (isHoneypotProbePath(path)) {
      const userAgent = c.req.header('user-agent') || 'Scanner/Automated Probe';
      const headersRecord: Record<string, string> = {};
      c.req.raw.headers.forEach((val, key) => {
        headersRecord[key] = val;
      });

      const probeRecord = honeypotService.trapProbe({
        ipAddress: clientIp,
        path,
        method: c.req.method,
        userAgent,
        headers: headersRecord
      });

      return c.json({
        success: false,
        error: 'Alerta de Segurança: Tentativa de reconhecimento/probe detectada e registrada na trilha WORM. IP colocado em quarentena.',
        code: 'HONEYPOT_TRAPPED',
        probeId: probeRecord.id,
        trappedAt: probeRecord.trappedAt,
        banExpiresAt: probeRecord.banExpiresAt
      }, 418);
    }

    await next();
  };
}
