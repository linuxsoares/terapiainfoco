import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { PrototypePollutionService } from '../services/prototypePollutionService';
import type {
  ScanObjectPayloadDTO,
  UpdatePollutionPolicyDTO,
  SimulatePollutionAttackDTO,
  VerifyPollutionSealDTO
} from '@terapiainfoco/shared';

export const prototypePollutionRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
prototypePollutionRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = PrototypePollutionService.getInstance();

/**
 * GET /api/prototype-pollution/overview
 * Retorna telemetria, política ativa e histórico de incidentes bloqueados
 */
prototypePollutionRouter.get('/overview', (c) => {
  try {
    const overview = service.getOverview();
    return c.json({
      success: true,
      overview
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao carregar visão geral de Prototype Pollution'
    }, 500);
  }
});

/**
 * POST /api/prototype-pollution/scan-payload
 * Varre e sanitiza um objeto clínico dinâmico antes de processá-lo
 */
prototypePollutionRouter.post('/scan-payload', async (c) => {
  try {
    const body = await c.req.json<ScanObjectPayloadDTO>();
    if (body.payload === undefined || !body.category) {
      return c.json({
        success: false,
        message: 'Parâmetros obrigatórios ausentes: payload e category.'
      }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown User-Agent';

    const response = service.scanPayload(body, clientIp, userAgent);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao escanear payload clínico'
    }, 400);
  }
});

/**
 * POST /api/prototype-pollution/update-policy
 * Atualiza os parâmetros de profundidade, contagem de chaves e estratégia de descarte
 */
prototypePollutionRouter.post('/update-policy', async (c) => {
  try {
    const body = await c.req.json<UpdatePollutionPolicyDTO>();
    if (!body.policy) {
      return c.json({
        success: false,
        message: 'Parâmetro obrigatório ausente: policy.'
      }, 400);
    }

    const response = service.updatePolicy(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao atualizar política de segurança'
    }, 400);
  }
});

/**
 * POST /api/prototype-pollution/simulate-attack
 * Executa simulação controlada de vetor adversarial de poluição de protótipo
 */
prototypePollutionRouter.post('/simulate-attack', async (c) => {
  try {
    const body = await c.req.json<SimulatePollutionAttackDTO>();
    if (!body.scenario) {
      return c.json({
        success: false,
        message: 'Parâmetro obrigatório ausente: scenario.'
      }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || '198.51.100.42';
    const userAgent = c.req.header('user-agent') || 'Penetration Testing Client';

    const response = service.simulateAttack(body, clientIp, userAgent);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao simular ataque adversarial'
    }, 400);
  }
});

/**
 * POST /api/prototype-pollution/verify-seal
 * Valida a autenticidade criptográfica de um selo WORM de sanitização RFC 8785
 */
prototypePollutionRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyPollutionSealDTO>();
    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'Parâmetro obrigatório ausente: sealToken.'
      }, 400);
    }

    const response = service.verifySeal(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao verificar selo probatório'
    }, 400);
  }
});
