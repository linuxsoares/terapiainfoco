import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectExpressionDTO,
  EvaluateExpressionDTO,
  UpdateExpressionPolicyDTO,
  SimulateExpressionAttackDTO,
  VerifyExpressionSealDTO,
} from '@terapiainfoco/shared';
import { ExpressionInjectionGuardService } from '../services/expressionInjectionGuardService';

export const expressionInjectionGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
expressionInjectionGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/expression-guard/overview
 * Retorna telemetria completa, métricas, incidentes, amostras de prontuários e selos probatórios WORM
 */
expressionInjectionGuardRoutes.get('/overview', async (c) => {
  try {
    const service = ExpressionInjectionGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json(
      { success: false, message: err.message || 'Erro ao carregar telemetria de Expression Injection Guard.' },
      500
    );
  }
});

/**
 * POST /api/expression-guard/inspect
 * Inspeciona léxica, heurística e sintaticamente uma expressão em busca de injeções (CWE-94, CWE-95)
 */
expressionInjectionGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectExpressionDTO>();
    if (!body || !body.expression) {
      return c.json({ success: false, message: 'A expressão clínica é obrigatória para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Search Engine';

    const service = ExpressionInjectionGuardService.getInstance();
    const result = await service.inspectExpression(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar expressão.' }, 500);
  }
});

/**
 * POST /api/expression-guard/evaluate
 * Avalia de forma estritamente segura (Zero eval) uma expressão AST contra a base de prontuários
 */
expressionInjectionGuardRoutes.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json<EvaluateExpressionDTO>();
    if (!body || !body.expression) {
      return c.json({ success: false, message: 'A expressão clínica é obrigatória para avaliação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Search Engine';

    const service = ExpressionInjectionGuardService.getInstance();
    const result = await service.evaluateExpression(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao avaliar expressão clínica.' }, 500);
  }
});

/**
 * POST /api/expression-guard/policy
 * Atualiza dinamicamente as políticas de governança, limites de nós e whitelist de campos
 */
expressionInjectionGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateExpressionPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'Objeto de política é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Internal Clinical Governance';

    const service = ExpressionInjectionGuardService.getInstance();
    const result = await service.updatePolicy(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao atualizar política de expressões.' }, 500);
  }
});

/**
 * POST /api/expression-guard/simulate
 * Simula vetores de ataque adversariais (CWE-94 / CWE-95) e avalia a resposta da blindagem AST
 */
expressionInjectionGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateExpressionAttackDTO>();
    if (!body || !body.threatCategory) {
      return c.json({ success: false, message: 'Categoria de ameaça é obrigatória para simulação.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Adversarial Expression Simulation Suite';

    const service = ExpressionInjectionGuardService.getInstance();
    const result = await service.simulateAttack(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao executar simulação de ataque de expressão.' }, 500);
  }
});

/**
 * POST /api/expression-guard/verify-seal
 * Valida a autenticidade e integridade criptográfica de um selo probatório WORM RFC 8785
 */
expressionInjectionGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyExpressionSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'Token ou objeto de selo probatório é obrigatório.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Security Notary Validator';

    const service = ExpressionInjectionGuardService.getInstance();
    const result = await service.verifySeal(body, clientIp, userAgent);

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao validar selo probatório de expressão.' }, 500);
  }
});
