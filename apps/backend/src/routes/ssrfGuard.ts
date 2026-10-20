import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { SsrfGuardService } from '../services/ssrfGuardService';
import type {
  SimulateSsrfDTO,
  ValidateWebhookUrlDTO,
  VerifySsrfSealDTO
} from '@terapiainfoco/shared';

export const ssrfGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
ssrfGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = SsrfGuardService.getInstance();

/**
 * GET /api/ssrf-guard/overview
 * Visão geral das proteções anti-SSRF, conectores protegidos, incidentes e métricas
 */
ssrfGuardRoutes.get('/overview', (c) => {
  const overview = service.getOverview();
  return c.json({
    success: true,
    overview
  });
});

/**
 * POST /api/ssrf-guard/simulate-ssrf
 * Simulação de ataque SSRF / DNS Rebinding para homologação e auditoria
 */
ssrfGuardRoutes.post('/simulate-ssrf', async (c) => {
  try {
    const body = await c.req.json<SimulateSsrfDTO>();
    if (!body.url || body.url.trim().length === 0) {
      return c.json(
        {
          success: false,
          message: 'A URL de destino é obrigatória para simulação.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'SSRF-Simulation-Agent';

    const result = service.simulateSsrf(body, {
      ip: clientIp,
      userAgent
    });

    return c.json(result);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao simular requisição SSRF: ${err.message}`
      },
      500
    );
  }
});

/**
 * POST /api/ssrf-guard/validate-url
 * Validação rigorosa de URL de webhook e conectores antes da transmissão
 */
ssrfGuardRoutes.post('/validate-url', async (c) => {
  try {
    const body = await c.req.json<ValidateWebhookUrlDTO>();
    if (!body.url || body.url.trim().length === 0) {
      return c.json(
        {
          success: false,
          message: 'A URL do webhook é obrigatória para validação.'
        },
        400
      );
    }

    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Webhook-Validator-Agent';

    const result = service.validateWebhookUrl(body, {
      ip: clientIp,
      userAgent
    });

    const status = result.success ? 200 : 403;
    return c.json(result, status);
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: `Erro interno na validação da URL: ${err.message}`
      },
      500
    );
  }
});

/**
 * POST /api/ssrf-guard/verify-seal
 * Verificação forense independente do selo probatório WORM HMAC-SHA256
 */
ssrfGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifySsrfSealDTO>();
    if (!body.proofSealToken || body.proofSealToken.trim().length === 0) {
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
 * GET /api/ssrf-guard/incidents
 * Lista de incidentes SSRF e tentativas de DNS Rebinding interceptadas
 */
ssrfGuardRoutes.get('/incidents', (c) => {
  const incidents = service.getIncidents();
  return c.json({
    success: true,
    incidents
  });
});
