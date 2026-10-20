import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectCommandInputDTO,
  ExecuteSandboxedCommandDTO,
  UpdateCommandPolicyDTO,
  SimulateCommandAttackDTO,
  VerifyCommandSealDTO,
} from '@terapiainfoco/shared';
import { OsCommandGuardService } from '../services/osCommandGuardService';

export const osCommandGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
osCommandGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/os-command-guard/overview
 * Retorna telemetria completa, pipelines clínicos autorizados, incidentes e selos probatórios WORM
 */
osCommandGuardRoutes.get('/overview', async (c) => {
  try {
    const service = OsCommandGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao carregar telemetria de OS Command Guard.' }, 500);
  }
});

/**
 * POST /api/os-command-guard/inspect
 * Inspeciona estática e lexicalmente um executável e seus argumentos em busca de injeções de comando
 */
osCommandGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectCommandInputDTO>();
    if (!body || !body.executable) {
      return c.json({ success: false, message: 'O binário executável é obrigatório para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Agent';

    const service = OsCommandGuardService.getInstance();
    const result = await service.inspect(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar argumentos de comando.' }, 500);
  }
});

/**
 * POST /api/os-command-guard/execute
 * Executa em enclave sandboxed isolado com emissão de selo WORM RFC 8785
 */
osCommandGuardRoutes.post('/execute', async (c) => {
  try {
    const body = await c.req.json<ExecuteSandboxedCommandDTO>();
    if (!body || !body.executable || !body.jobType) {
      return c.json({ success: false, message: 'Binário e tipo de job são obrigatórios para execução.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Agent';

    const service = OsCommandGuardService.getInstance();
    const result = await service.executeSandboxed(body, clientIp, userAgent);

    return c.json(result, result.success ? 200 : 400);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao executar comando em sandbox.' }, 500);
  }
});

/**
 * POST /api/os-command-guard/policy
 * Atualiza parâmetros de hardening do enclave sandboxed (RBAC: ADMIN / PSICOLOGO_TITULAR)
 */
osCommandGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateCommandPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'Parâmetros de política são obrigatórios.' }, 400);
    }

    const therapistId = c.req.header('x-user-id') || 'ADMIN_OFFICER';
    const service = OsCommandGuardService.getInstance();
    const result = await service.updatePolicy(body, therapistId);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao atualizar política de comandos.' }, 500);
  }
});

/**
 * POST /api/os-command-guard/simulate
 * Simula vetores de injeção de shell e evasão de sandbox para fins de auditoria e conformidade OWASP
 */
osCommandGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateCommandAttackDTO>();
    if (!body || !body.threatVector) {
      return c.json({ success: false, message: 'Vetor de ameaça é obrigatório para simulação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Adversarial Simulator';

    const service = OsCommandGuardService.getInstance();
    const result = await service.simulateAttack(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao processar simulação adversarial.' }, 500);
  }
});

/**
 * POST /api/os-command-guard/verify-seal
 * Validação pericial forense de selo probatório RFC 8785 WORM
 */
osCommandGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyCommandSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'Token de selo ou objeto é obrigatório.' }, 400);
    }

    const therapistId = c.req.header('x-user-id') || 'AUDITOR_OFFICER';
    const service = OsCommandGuardService.getInstance();
    const result = await service.verifySeal(body, therapistId);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao verificar selo probatório.' }, 500);
  }
});
