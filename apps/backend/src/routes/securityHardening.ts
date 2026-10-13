import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { honeypotService } from '../services/honeypotService';
import { evaluateSecurityHeaders, RECOMMENDED_SECURITY_HEADERS } from '@terapiainfoco/crypto';
import type {
  SecurityHardeningOverviewResponse,
  UnbanIpRequestDTO,
  UnbanIpResponse,
  VerifySecurityHeadersResponse
} from '@terapiainfoco/shared';

export const securityHardeningRoute = new Hono();

// Autenticação e RBAC restrito a Administradores (LGPD Art. 46, SOC2 CC6.1)
securityHardeningRoute.use('*', authMiddleware());
const requireAdmin = requireRoles([UserRole.ADMIN]);

/**
 * 1. Panorama Consolidado de Hardening HTTP & Honeypot
 */
securityHardeningRoute.get('/overview', requireAdmin, (c) => {
  const metrics = honeypotService.getMetrics();
  const activeBannedIps = honeypotService.getActiveBans();
  const recentProbes = honeypotService.getRecentProbes(50);

  const response: SecurityHardeningOverviewResponse = {
    success: true,
    metrics,
    activeBannedIps,
    recentProbes
  };

  return c.json(response, 200);
});

/**
 * 2. Desbloqueio Manual de IP em Quarentena (Ação Administrativa com Trilha WORM)
 */
securityHardeningRoute.post('/honeypot/unban', requireAdmin, async (c) => {
  const user = c.get('user');
  const actorIp = c.req.header('x-forwarded-for') || '127.0.0.1';
  const body = await c.req.json<UnbanIpRequestDTO>().catch(() => null);

  if (!body || !body.ipAddress) {
    return c.json({
      success: false,
      error: 'Parâmetro obrigatório ipAddress não informado.'
    }, 400);
  }

  const success = honeypotService.unbanIp(
    body.ipAddress,
    user?.id || 'admin',
    actorIp,
    body.reason
  );

  if (!success) {
    return c.json({
      success: false,
      error: `Endereço IP ${body.ipAddress} não encontrado na lista de banimentos ativos.`
    }, 404);
  }

  const response: UnbanIpResponse = {
    success: true,
    ipAddress: body.ipAddress,
    message: `Endereço IP ${body.ipAddress} removido da quarentena e registrado no WORM com sucesso.`,
    unbannedAt: new Date().toISOString()
  };

  return c.json(response, 200);
});

/**
 * 3. Verificação ao Vivo de Cabeçalhos de Segurança HTTP (OWASP Matrix)
 */
securityHardeningRoute.get('/headers/verify', requireAdmin, (c) => {
  const sampleHeaders: Record<string, string> = {};
  for (const [key, spec] of Object.entries(RECOMMENDED_SECURITY_HEADERS)) {
    sampleHeaders[key] = spec.value;
  }

  const evaluation = evaluateSecurityHeaders(sampleHeaders);

  const response: VerifySecurityHeadersResponse = {
    success: true,
    evaluation
  };

  return c.json(response, 200);
});
