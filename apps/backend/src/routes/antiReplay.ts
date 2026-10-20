import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { AntiReplayService } from '../services/antiReplayService';
import type {
  VerifyNonceDTO,
  GetSlidingWindowStatusDTO,
  UpdateReplayPolicyDTO,
  SimulateReplayAttackDTO,
  VerifyAntiReplaySealDTO
} from '@terapiainfoco/shared';

export const antiReplayRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
antiReplayRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const antiReplayService = AntiReplayService.getInstance();

/**
 * GET /api/anti-replay/overview
 * Visão consolidada da proteção anti-replay, janelas deslizantes e métricas do filtro de Bloom
 */
antiReplayRouter.get('/overview', async (c) => {
  try {
    const overview = antiReplayService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao carregar visão geral de anti-replay.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/verify-nonce
 * Avalia a singularidade de um nonce ou número de sequência
 */
antiReplayRouter.post('/verify-nonce', async (c) => {
  try {
    const body = await c.req.json<VerifyNonceDTO>();

    if (!body.targetProtocol || !body.nonceOrSeq) {
      return c.json({
        success: false,
        message: 'O protocolo alvo e o nonce/sequência são obrigatórios.'
      }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await antiReplayService.verifyNonce(body, 'API_GATEWAY', clientIp);

    return c.json({
      success: true,
      result,
      message: result.reason
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao verificar nonce/sequência.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/sliding-window-status
 * Obtém o estado e o mapa de bits de uma janela deslizante ativa
 */
antiReplayRouter.post('/sliding-window-status', async (c) => {
  try {
    const body = await c.req.json<GetSlidingWindowStatusDTO>();

    if (!body.channelId) {
      return c.json({
        success: false,
        message: 'O identificador do canal é obrigatório.'
      }, 400);
    }

    const window = antiReplayService.getSlidingWindowStatus(body.channelId);

    return c.json({
      success: true,
      window
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao obter status da janela deslizante.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/rotate-bloom-filter
 * Dispara a rotação manual de geração do Filtro de Bloom
 */
antiReplayRouter.post('/rotate-bloom-filter', async (c) => {
  try {
    const result = await antiReplayService.rotateBloomFilter('ADMIN_OPERATOR');

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao rotacionar filtro de Bloom.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/update-policy
 * Atualiza o modo operacional de mitigação anti-replay
 */
antiReplayRouter.post('/update-policy', async (c) => {
  try {
    const body = await c.req.json<UpdateReplayPolicyDTO>();

    if (!body.mode) {
      return c.json({
        success: false,
        message: 'O modo de defesa anti-replay é obrigatório.'
      }, 400);
    }

    const result = await antiReplayService.updatePolicy(body);

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao atualizar política anti-replay.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/simulate-replay-attack
 * Executa simulação de ataque de replay ou reutilização de nonce
 */
antiReplayRouter.post('/simulate-replay-attack', async (c) => {
  try {
    const body = await c.req.json<SimulateReplayAttackDTO>();

    if (!body.targetProtocol) {
      return c.json({
        success: false,
        message: 'O protocolo para simulação de replay é obrigatório.'
      }, 400);
    }

    const result = await antiReplayService.simulateReplayAttack(body);

    return c.json({
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao simular ataque de replay.'
    }, 500);
  }
});

/**
 * POST /api/anti-replay/verify-seal
 * Valida a integridade forense do Selo Probatório WORM
 */
antiReplayRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyAntiReplaySealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'O token do selo probatório é obrigatório.'
      }, 400);
    }

    const result = antiReplayService.verifySeal(body);

    return c.json({
      success: result.valid,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao validar selo probatório anti-replay.'
    }, 500);
  }
});
