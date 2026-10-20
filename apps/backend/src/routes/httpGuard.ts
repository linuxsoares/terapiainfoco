import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { HttpGuardService } from '../services/httpGuardService';
import type {
  SimulateHppAttackDTO,
  SimulateHeaderInjectionDTO,
  VerifyHttpGuardSealDTO
} from '@terapiainfoco/shared';

export const httpGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
httpGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const guardService = HttpGuardService.getInstance();

/**
 * GET /api/http-guard/overview
 * Retorna visão geral, métricas e incidentes recentes
 */
httpGuardRoutes.get('/overview', (c) => {
  const overview = guardService.getOverview();
  return c.json({
    success: true,
    overview
  });
});

/**
 * POST /api/http-guard/simulate-hpp
 * Simula pentest de Parameter Pollution (HPP)
 */
httpGuardRoutes.post('/simulate-hpp', async (c) => {
  try {
    const body = await c.req.json<SimulateHppAttackDTO>();
    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const actorId = 'clinical_security_officer';

    const result = guardService.simulateHppAttack(
      {
        ...body,
        clientIp: body.clientIp || clientIp
      },
      actorId
    );

    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao simular ataque HPP: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * POST /api/http-guard/simulate-header-injection
 * Simula pentest de Injeção de Cabeçalho / CRLF / Response Splitting
 */
httpGuardRoutes.post('/simulate-header-injection', async (c) => {
  try {
    const body = await c.req.json<SimulateHeaderInjectionDTO>();
    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const actorId = 'clinical_security_officer';

    const result = guardService.simulateHeaderInjection(
      {
        ...body,
        clientIp: body.clientIp || clientIp
      },
      actorId
    );

    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao simular injeção de cabeçalho: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * POST /api/http-guard/verify-seal
 * Valida a integridade matemática e a fé pública de um selo probatório
 */
httpGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyHttpGuardSealDTO>();
    const actorId = 'forensic_auditor';

    const result = guardService.verifyProofSeal(body, actorId);
    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        message: `Falha ao validar selo: ${error?.message || error}`
      },
      400
    );
  }
});

/**
 * GET /api/http-guard/incidents
 * Retorna todos os incidentes registrados pelo guardião HTTP
 */
httpGuardRoutes.get('/incidents', (c) => {
  const incidents = guardService.getIncidents();
  return c.json({
    success: true,
    incidents
  });
});
