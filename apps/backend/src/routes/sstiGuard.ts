import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectTemplateDTO,
  RenderSandboxedTemplateDTO,
  UpdateSstiPolicyDTO,
  SimulateSstiAttackDTO,
  VerifySstiSealDTO
} from '@terapiainfoco/shared';
import { SstiGuardService } from '../services/sstiGuardService';

export const sstiGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
sstiGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/ssti-guard/overview
 * Retorna telemetria completa, presets CFP nº 006/2019, incidentes e selos probatórios WORM
 */
sstiGuardRoutes.get('/overview', async (c) => {
  try {
    const service = SstiGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao carregar telemetria de SSTI Guard.' }, 500);
  }
});

/**
 * POST /api/ssti-guard/inspect
 * Inspeciona estática e lexicalmente um template clínico em busca de vetores SSTI
 */
sstiGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectTemplateDTO>();
    if (!body || !body.templateContent) {
      return c.json({ success: false, message: 'O conteúdo do template é obrigatório para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_system_user';
    const userRole = (c.req.header('x-user-role') as UserRole) || UserRole.PSICOLOGO_TITULAR;

    const service = SstiGuardService.getInstance();
    const result = await service.inspect(body, { clientIp, userId, userRole });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar template clínico.' }, 500);
  }
});

/**
 * POST /api/ssti-guard/render
 * Renderiza em sandbox hermético isolado emitindo selo criptográfico de integridade WORM
 */
sstiGuardRoutes.post('/render', async (c) => {
  try {
    const body = await c.req.json<RenderSandboxedTemplateDTO>();
    if (!body || !body.templateContent) {
      return c.json({ success: false, message: 'O conteúdo do template é obrigatório para renderização.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_system_user';
    const userRole = (c.req.header('x-user-role') as UserRole) || UserRole.PSICOLOGO_TITULAR;

    const service = SstiGuardService.getInstance();
    const result = await service.render(body, { clientIp, userId, userRole });

    return c.json(result, result.success ? 200 : 400);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha na renderização segura do template.' }, 500);
  }
});

/**
 * PUT /api/ssti-guard/policy
 * Atualiza políticas e guardrails de sandboxing (Requer ADMIN ou PSICOLOGO_TITULAR)
 */
sstiGuardRoutes.put('/policy', async (c) => {
  try {
    const userRole = c.req.header('x-user-role');
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_admin_operator';

    if (userRole && userRole !== UserRole.ADMIN && userRole !== UserRole.PSICOLOGO_TITULAR) {
      return c.json({ success: false, message: 'Acesso negado. Apenas Administradores ou Titulares podem alterar políticas de SSTI Guard.' }, 403);
    }

    const body = await c.req.json<UpdateSstiPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'Configurações de política ausentes.' }, 400);
    }

    const service = SstiGuardService.getInstance();
    const result = await service.updatePolicy(body, { clientIp, userId });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao atualizar políticas de SSTI.' }, 500);
  }
});

/**
 * POST /api/ssti-guard/simulate
 * Simula ataque adversarial SSTI em ambiente isolado
 */
sstiGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateSstiAttackDTO>();
    if (!body || !body.threatVector) {
      return c.json({ success: false, message: 'Vetor de ameaça obrigatório para simulação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_sec_auditor';
    const userRole = (c.req.header('x-user-role') as UserRole) || UserRole.ADMIN;

    const service = SstiGuardService.getInstance();
    const result = await service.simulateAttack(body, { clientIp, userId, userRole });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao executar simulação de ataque SSTI.' }, 500);
  }
});

/**
 * POST /api/ssti-guard/verify-seal
 * Valida a autenticidade e fé pública do Selo Probatório WORM RFC 8785
 */
sstiGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifySstiSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'Token ou objeto de selo obrigatório para verificação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_system_user';

    const service = SstiGuardService.getInstance();
    const result = await service.verifySeal(body, { clientIp, userId });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao verificar selo probatório de SSTI.' }, 500);
  }
});
