import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { AdvancedRateLimiterService } from '../services/advancedRateLimiterService';
import type {
  EvaluateRateLimitDTO,
  ConfigureRateLimitRuleDTO,
  ResetClientBucketDTO,
  VerifyRateLimitSealDTO
} from '@terapiainfoco/shared';

export const advancedRateLimiterRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
advancedRateLimiterRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = AdvancedRateLimiterService.getInstance();

/**
 * GET /api/advanced-rate-limiter/overview
 * Visão geral das métricas operacionais, regras configuradas e clientes em quarentena
 */
advancedRateLimiterRoutes.get('/overview', (c) => {
  const overview = service.getOverview();
  return c.json({
    success: true,
    overview
  });
});

/**
 * POST /api/advanced-rate-limiter/evaluate
 * Avaliação e consumo de tokens em tempo real para um cliente e endpoint
 */
advancedRateLimiterRoutes.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json<EvaluateRateLimitDTO>();
    if (!body.clientId || !body.path) {
      return c.json(
        {
          success: false,
          message: 'Os campos clientId e path são obrigatórios.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || body.clientId;
    const userAgent = c.req.header('user-agent') || 'Rate-Limiter-Client';

    const result = service.evaluate(body, {
      ip: clientIp,
      userAgent
    });

    const status = result.success ? 200 : (result.evaluation.decision === 'QUARANTINED' ? 403 : 429);

    if (!result.success) {
      c.header('Retry-After', String(result.evaluation.retryAfterSeconds));
    }
    c.header('X-RateLimit-Remaining-Tokens', String(result.evaluation.remainingTokens));
    c.header('X-RateLimit-Window-Requests', String(result.evaluation.currentWindowCount));

    return c.json(result, status);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao avaliar rate limit: ${err.message}`
      },
      500
    );
  }
});

/**
 * POST /api/advanced-rate-limiter/rules/configure
 * Ajuste administrativo de limites e parâmetros de recarga por regra
 */
advancedRateLimiterRoutes.post('/rules/configure', async (c) => {
  try {
    const body = await c.req.json<ConfigureRateLimitRuleDTO>();
    if (!body.ruleId) {
      return c.json(
        {
          success: false,
          message: 'O campo ruleId é obrigatório.'
        },
        400
      );
    }

    const result = service.configureRule(body);
    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Erro ao configurar regra: ${err.message}`
      },
      500
    );
  }
});

/**
 * POST /api/advanced-rate-limiter/clients/reset
 * Desbloqueio e reset de contadores de cliente em quarentena
 */
advancedRateLimiterRoutes.post('/clients/reset', async (c) => {
  try {
    const body = await c.req.json<ResetClientBucketDTO>();
    if (!body.clientId) {
      return c.json(
        {
          success: false,
          message: 'O campo clientId é obrigatório.'
        },
        400
      );
    }

    const result = service.resetClient(body);
    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao resetar cliente: ${err.message}`
      },
      500
    );
  }
});

/**
 * POST /api/advanced-rate-limiter/verify-seal
 * Verificação forense independente do selo probatório HMAC-SHA256 WORM
 */
advancedRateLimiterRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyRateLimitSealDTO>();
    if (!body.proofSealToken) {
      return c.json(
        {
          success: false,
          message: 'O token do selo probatório é obrigatório.'
        },
        400
      );
    }

    const result = service.verifyProofSeal(body);
    const status = result.isValid ? 200 : 422;
    return c.json(result, status);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao verificar selo probatório: ${err.message}`
      },
      500
    );
  }
});

/**
 * GET /api/advanced-rate-limiter/rules
 * Lista de regras de rate limit ativas
 */
advancedRateLimiterRoutes.get('/rules', (c) => {
  const rules = service.getRules();
  return c.json({
    success: true,
    rules
  });
});
