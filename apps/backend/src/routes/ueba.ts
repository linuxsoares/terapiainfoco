import { Hono } from 'hono';
import { UebaService } from '../services/uebaService';
import type {
  EvaluateAccessRiskDTO,
  SimulateAccessPatternDTO,
  ApplyUebaContainmentDTO
} from '@terapiainfoco/shared';

const uebaRouter = new Hono();
const uebaService = UebaService.getInstance();

/**
 * POST /api/ueba/evaluate
 * Avaliação preditiva de risco comportamental de acesso clínico em tempo real
 */
uebaRouter.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json<EvaluateAccessRiskDTO>();

    if (!body.userId || !body.resourceType || !body.actionType) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: userId, resourceType, actionType.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '189.40.10.15';
    const userAgent = c.req.header('user-agent') || 'TerapiaInFoco Web Client';

    const result = await uebaService.evaluateAccess(body, { ip, userAgent });

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao avaliar risco de acesso.' }, 500);
  }
});

/**
 * POST /api/ueba/simulate
 * Simula cenários anômalos de acesso e exfiltração para validação
 */
uebaRouter.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateAccessPatternDTO>();

    if (!body.scenario) {
      return c.json({
        success: false,
        message: 'Cenário de simulação é obrigatório.'
      }, 400);
    }

    const result = await uebaService.simulatePattern(body);

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao simular padrão de acesso.' }, 500);
  }
});

/**
 * POST /api/ueba/contain
 * Aplica ou revoga contenção preventiva com registro WORM
 */
uebaRouter.post('/contain', async (c) => {
  try {
    const body = await c.req.json<ApplyUebaContainmentDTO>();

    if (!body.userId || !body.action) {
      return c.json({
        success: false,
        message: 'Campos obrigatórios ausentes: userId, action.'
      }, 400);
    }

    const operatorId = 'dpo-compliance-operator'; // Em produção, obtido do JWT autenticado
    const result = await uebaService.applyContainment(body, operatorId);

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao aplicar contenção.' }, 500);
  }
});

/**
 * GET /api/ueba/overview
 * Visão Geral Executiva de Governança e Métricas UEBA
 */
uebaRouter.get('/overview', (c) => {
  try {
    const overview = uebaService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao obter métricas UEBA.' }, 500);
  }
});

/**
 * GET /api/ueba/incidents
 * Listagem cronológica de incidentes anômalos detectados
 */
uebaRouter.get('/incidents', (c) => {
  try {
    const incidents = uebaService.getIncidents();
    return c.json({
      success: true,
      incidents,
      total: incidents.length
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao listar incidentes UEBA.' }, 500);
  }
});

/**
 * GET /api/ueba/profile/:userId
 * Retorna o baseline comportamental e status de contenção de um usuário
 */
uebaRouter.get('/profile/:userId', (c) => {
  try {
    const userId = c.req.param('userId');
    if (!userId) {
      return c.json({ success: false, message: 'ID do usuário é obrigatório.' }, 400);
    }

    const profile = uebaService.getUserProfile(userId);
    return c.json({
      success: true,
      ...profile
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message || 'Erro ao obter perfil UEBA.' }, 500);
  }
});

export { uebaRouter };
