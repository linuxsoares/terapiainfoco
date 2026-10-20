import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  InspectGraphQLQueryDTO,
  UpdateGraphQLPolicyDTO,
  SimulateGraphQLAttackDTO,
  VerifyGraphQLCostSealDTO,
} from '@terapiainfoco/shared';
import { GraphQLQueryGuardService } from '../services/graphQLQueryGuardService';

export const graphQLQueryGuardRoutes = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
graphQLQueryGuardRoutes.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/graphql-guard/overview
 * Retorna telemetria operacional, métricas, incidentes, schemas clínicos e selos de custo
 */
graphQLQueryGuardRoutes.get('/overview', async (c) => {
  try {
    const service = GraphQLQueryGuardService.getInstance();
    const overview = service.getOverview();
    return c.json({ success: true, overview });
  } catch (err: any) {
    return c.json(
      { success: false, message: err.message || 'Erro ao carregar telemetria de GraphQL Query Guard.' },
      500
    );
  }
});

/**
 * POST /api/graphql-guard/inspect
 * Inspeciona estaticamente custo, profundidade, introspecção e segurança de uma query GraphQL
 */
graphQLQueryGuardRoutes.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectGraphQLQueryDTO>();
    if (!body || !body.query) {
      return c.json({ success: false, message: 'A query GraphQL é obrigatória para inspeção.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'GraphQL-Client';

    const service = GraphQLQueryGuardService.getInstance();
    const result = service.inspectQuery(body, clientIp, userAgent, c.get('userId'));

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao inspecionar consulta GraphQL.' }, 500);
  }
});

/**
 * POST /api/graphql-guard/policy
 * Atualiza diretrizes de custo, profundidade e introspecção
 */
graphQLQueryGuardRoutes.post('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateGraphQLPolicyDTO>();
    if (!body || !body.policy) {
      return c.json({ success: false, message: 'As configurações de política são obrigatórias.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Admin-Console';

    const service = GraphQLQueryGuardService.getInstance();
    const result = service.updatePolicy(body, c.get('user').role, clientIp, userAgent, c.get('userId'));

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao atualizar políticas de GraphQL.' }, 500);
  }
});

/**
 * POST /api/graphql-guard/simulate
 * Simula ataques adversariais de pentest contra a API GraphQL (CWE-400 DoS, Introspecção, Batch Flooding)
 */
graphQLQueryGuardRoutes.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateGraphQLAttackDTO>();
    if (!body || !body.threatCategory) {
      return c.json({ success: false, message: 'A categoria da ameaça para simulação é obrigatória.' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Adversarial-Simulator';

    const service = GraphQLQueryGuardService.getInstance();
    const result = service.simulateAttack(body, clientIp, userAgent, c.get('userId'));

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao simular ataque GraphQL.' }, 500);
  }
});

/**
 * POST /api/graphql-guard/verify-seal
 * Valida matematicamente a autenticidade de um selo probatório notarial WORM de custo GraphQL RFC 8785
 */
graphQLQueryGuardRoutes.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyGraphQLCostSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'O token do selo ou objeto do selo é obrigatório.' }, 400);
    }

    const service = GraphQLQueryGuardService.getInstance();
    const result = service.verifySeal(body, c.get('userId'));

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao validar selo notarial GraphQL.' }, 500);
  }
});

/**
 * GET /api/graphql-guard/schemas
 * Retorna os schemas clínicos homologados da plataforma
 */
graphQLQueryGuardRoutes.get('/schemas', async (c) => {
  try {
    const service = GraphQLQueryGuardService.getInstance();
    const result = service.getSchemas();
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Falha ao listar schemas GraphQL.' }, 500);
  }
});
