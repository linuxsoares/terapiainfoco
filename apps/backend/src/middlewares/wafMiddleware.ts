import type { MiddlewareHandler } from 'hono';
import { wafService } from '../services/wafService';
import { WafMode } from '@terapiainfoco/shared';

/**
 * Middleware de Inspeção de Payloads do Web Application Firewall (WAF)
 * RFC-001 §4.4, §5.2 e OWASP Top 10
 */
export function wafMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Pula rotas internas de health probes e rotas de teste/inspeção do próprio WAF, XML Guard, ReDoS Guard, SSTI Guard, OS Command Guard, Path Traversal Guard, Expression Guard, GraphQL Guard, HTTP/2 Guard e Supply Chain Guard
    const path = c.req.path;
    if (path.startsWith('/health') || path === '/api/security/waf/inspect' || path.startsWith('/api/xml-guard') || path.startsWith('/api/redos-guard') || path.startsWith('/api/ssti-guard') || path.startsWith('/api/os-command-guard') || path.startsWith('/api/path-traversal-guard') || path.startsWith('/api/expression-guard') || path.startsWith('/api/graphql-guard') || path.startsWith('/api/http2-guard') || path.startsWith('/api/supply-chain-guard')) {
      return next();
    }

    const mode = wafService.getMode();
    if (mode === WafMode.DISABLED) {
      return next();
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';
    const method = c.req.method;

    // 1. Inspeciona Query Parameters
    const url = new URL(c.req.url);
    const queryEntries: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      queryEntries[k] = v;
    });

    if (Object.keys(queryEntries).length > 0) {
      const queryInspection = wafService.inspect(queryEntries);
      if (!queryInspection.passed) {
        const incident = wafService.recordIncident({
          ipAddress,
          userAgent,
          method,
          path,
          inspection: queryInspection,
          rawPayloadSnippet: JSON.stringify(queryEntries)
        });

        if (mode === WafMode.ACTIVE_BLOCK) {
          return c.json({
            success: false,
            error: 'WAF_ATTACK_DETECTED',
            message: 'Requisição bloqueada preventivamente pelo Web Application Firewall (WAF) da aplicação.',
            attackType: queryInspection.matchedRules[0]?.category,
            threatScore: queryInspection.threatScore,
            incidentId: incident.id
          }, 403);
        }
      }
    }

    // 2. Inspeciona Body em requisições com dados (POST, PUT, PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentType = c.req.header('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const clonedReq = c.req.raw.clone();
          const bodyText = await clonedReq.text();
          if (bodyText && bodyText.trim().length > 0) {
            let bodyData: any = bodyText;
            try {
              bodyData = JSON.parse(bodyText);
            } catch {
              // Se não for JSON estrito, inspeciona o texto bruto
            }

            const bodyInspection = wafService.inspect(bodyData);
            if (!bodyInspection.passed) {
              const incident = wafService.recordIncident({
                ipAddress,
                userAgent,
                method,
                path,
                inspection: bodyInspection,
                rawPayloadSnippet: bodyText
              });

              if (mode === WafMode.ACTIVE_BLOCK) {
                return c.json({
                  success: false,
                  error: 'WAF_ATTACK_DETECTED',
                  message: 'Requisição bloqueada preventivamente pelo Web Application Firewall (WAF) da aplicação.',
                  attackType: bodyInspection.matchedRules[0]?.category,
                  threatScore: bodyInspection.threatScore,
                  incidentId: incident.id
                }, 403);
              }
            }
          }
        } catch {
          // Em caso de falha de clone de stream, permite fluxo normal
        }
      }
    }

    return next();
  };
}
