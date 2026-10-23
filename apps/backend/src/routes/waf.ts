import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { wafService } from '../services/wafService';
import type {
  WafOverviewResponse,
  InspectPayloadDTO,
  InspectPayloadResponse,
  UpdateWafModeDTO,
  UpdateWafModeResponse
} from '@terapiainfoco/shared';

export const wafRoute = new Hono();

// Autenticação obrigatória
wafRoute.use('*', authMiddleware());
const requireAdmin = requireRoles([UserRole.ADMIN]);

/**
 * 1. Panorama Geral do WAF (Métricas e Incidentes Recentes)
 */
wafRoute.get('/overview', requireAdmin, (c) => {
  const metrics = wafService.getMetrics();
  const recentIncidents = wafService.getRecentIncidents(50);

  const response: WafOverviewResponse = {
    success: true,
    metrics,
    recentIncidents
  };

  return c.json(response, 200);
});

/**
 * 2. Inspecionar Manualmente um Payload Clínico ou Query String
 */
wafRoute.post('/inspect', requireAdmin, async (c) => {
  const body = await c.req.json<InspectPayloadDTO>().catch(() => null);

  if (!body || body.payload === undefined) {
    return c.json({
      success: false,
      error: 'Parâmetro obrigatório payload não informado.'
    }, 400);
  }

  const inspection = wafService.inspect(body.payload);
  const response: InspectPayloadResponse = {
    success: true,
    inspection,
    threatScore: inspection.threatScore,
    blocked: !inspection.passed,
    message: inspection.passed
      ? 'Payload limpo e aprovado pela inspeção heurística do WAF.'
      : `Alerta: Payload suspeito! Score de ameaça ${inspection.threatScore}/100 excede o limiar de segurança.`
  };

  return c.json(response, 200);
});

/**
 * 3. Atualizar Modo de Operação do WAF e Limiar de Bloqueio (Ação Administrativa com WORM)
 */
wafRoute.post('/mode', requireAdmin, async (c) => {
  const user = c.get('user');
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'Unknown';
  const body = await c.req.json<UpdateWafModeDTO>().catch(() => null);

  if (!body || !body.mode) {
    return c.json({
      success: false,
      error: 'Parâmetro obrigatório mode não informado.'
    }, 400);
  }

  const updated = wafService.updateSettings({
    mode: body.mode,
    blockThreshold: body.blockThreshold,
    updatedBy: user?.id || 'admin',
    ipAddress,
    userAgent
  });

  const response: UpdateWafModeResponse = {
    success: true,
    mode: updated.mode,
    blockThreshold: updated.blockThreshold,
    message: `Configuração do WAF atualizada com sucesso para modo ${updated.mode} (Limiar: ${updated.blockThreshold}).`
  };

  return c.json(response, 200);
});
