import { Hono } from 'hono';
import { UserRole } from '@terapiainfoco/shared';
import type {
  AnalyzeRegexDTO,
  ExecuteSafeRegexDTO,
  UpdateRedosPolicyDTO,
  SimulateRedosAttackDTO,
  VerifyRedosSealDTO
} from '@terapiainfoco/shared';
import { RedosGuardService } from '../services/redosGuardService';

export const redosGuardRoutes = new Hono();

/**
 * GET /api/redos-guard/overview
 * Retorna visão geral consolidada de métricas, políticas, incidentes e presets clínicos
 */
redosGuardRoutes.get('/overview', async (c) => {
  try {
    const service = RedosGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao carregar telemetria de ReDoS Guard' }, 500);
  }
});

/**
 * POST /api/redos-guard/analyze
 * Analisa a complexidade de uma expressão regular e executa com guardrail se houver entrada
 */
redosGuardRoutes.post('/analyze', async (c) => {
  try {
    const body = await c.req.json<AnalyzeRegexDTO>();
    if (!body || !body.pattern) {
      return c.json({ success: false, message: 'O padrão de expressão regular é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_system_user';
    const userRole = (c.req.header('x-user-role') as UserRole) || UserRole.PSICOLOGO_TITULAR;

    const service = RedosGuardService.getInstance();
    const result = await service.analyzeAndExecute(body, { clientIp, userId, userRole });

    return c.json(result, result.success ? 200 : 400);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao analisar expressão regular.' }, 500);
  }
});

/**
 * POST /api/redos-guard/execute
 * Executa regex com guardrails de isolamento e timeout
 */
redosGuardRoutes.post('/execute', async (c) => {
  try {
    const body = await c.req.json<ExecuteSafeRegexDTO>();
    if (!body || !body.pattern || body.input === undefined) {
      return c.json({ success: false, message: 'Padrão e texto de entrada são obrigatórios.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userId = c.req.header('x-user-id') || 'psi_system_user';

    const service = RedosGuardService.getInstance();
    const result = await service.executeSafe(body, { clientIp, userId });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao executar expressão regular.' }, 500);
  }
});

/**
 * PUT /api/redos-guard/policy
 * Atualiza parâmetros da política de proteção de ReDoS
 */
redosGuardRoutes.put('/policy', async (c) => {
  try {
    const userRole = c.req.header('x-user-role');
    const userId = c.req.header('x-user-id') || 'psi_admin_operator';

    if (userRole && userRole !== UserRole.ADMIN && userRole !== UserRole.PSICOLOGO_TITULAR) {
      return c.json({ success: false, message: 'Acesso negado. Apenas Administradores ou Titulares podem alterar políticas de ReDoS.' }, 403);
    }

    const body = await c.req.json<UpdateRedosPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'Configurações de política ausentes.' }, 400);
    }

    const service = RedosGuardService.getInstance();
    const policy = await service.updatePolicy(body.policy, userId);

    return c.json({
      success: true,
      policy,
      message: 'Políticas de proteção contra ReDoS atualizadas com sucesso.'
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao atualizar políticas de ReDoS.' }, 500);
  }
});

/**
 * POST /api/redos-guard/simulate
 * Simula um ataque adversarial com Evil Regex ou repetições sobrepostas
 */
redosGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateRedosAttackDTO>();
    const clientIp = c.req.header('x-forwarded-for') || '198.51.100.99';
    const userId = c.req.header('x-user-id') || 'simulated_adversary_agent';

    const service = RedosGuardService.getInstance();
    const result = await service.simulateAttack(body || {}, { clientIp, userId });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao simular ataque ReDoS.' }, 500);
  }
});

/**
 * POST /api/redos-guard/verify-seal
 * Validação notarial de selo WORM de integridade do ReDoS Guard
 */
redosGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyRedosSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, isValid: false, message: 'Token de selo probatório obrigatório.' }, 400);
    }

    const service = RedosGuardService.getInstance();
    const result = await service.verifySeal(body.sealToken);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, isValid: false, message: err.message || 'Erro ao validar selo ReDoS.' }, 500);
  }
});
