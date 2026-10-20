import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { SideChannelService } from '../services/sideChannelService';
import type {
  InspectSideChannelDTO,
  RunWelchTestDTO,
  CalibrateJitterDTO,
  UpdateSideChannelPolicyDTO,
  SimulateTimingAttackDTO,
  VerifySideChannelSealDTO
} from '@terapiainfoco/shared';

export const sideChannelRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
sideChannelRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const sideChannelService = SideChannelService.getInstance();

/**
 * GET /api/side-channel/overview
 * Visão consolidada da blindagem contra side-channel e timing leaks
 */
sideChannelRouter.get('/overview', async (c) => {
  try {
    const overview = sideChannelService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao carregar visão geral de side-channel.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/inspect-operation
 * Executa inspeção de operação sensível em tempo de execução
 */
sideChannelRouter.post('/inspect-operation', async (c) => {
  try {
    const body = await c.req.json<InspectSideChannelDTO>();

    if (!body.targetOperation) {
      return c.json({
        success: false,
        message: 'A operação alvo de inspeção é obrigatória.'
      }, 400);
    }

    const inspection = await sideChannelService.inspectOperation(body);

    return c.json({
      success: true,
      inspection,
      message: `Inspeção concluída: ${inspection.explanation}`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao inspecionar operação.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/run-welch-test
 * Dispara Pentest Estatístico de Welch (Welch's t-test) com laudo NIST
 */
sideChannelRouter.post('/run-welch-test', async (c) => {
  try {
    const body = await c.req.json<RunWelchTestDTO>();

    if (!body.targetOperation) {
      return c.json({
        success: false,
        message: 'A operação para execução do teste de Welch é obrigatória.'
      }, 400);
    }

    const report = await sideChannelService.runWelchTest(body);

    return c.json({
      success: true,
      report,
      message: `Pentest estatístico concluído: |t| = ${report.welchTest.tScore} (${report.welchTest.nistCompliant ? 'Imune' : 'Vulnerável'}).`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao executar teste de Welch.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/calibrate-jitter
 * Calibra a latência do Jitter Estocástico Regulado
 */
sideChannelRouter.post('/calibrate-jitter', async (c) => {
  try {
    const body = await c.req.json<CalibrateJitterDTO>();

    if (body.targetLatencyMs === undefined || body.targetLatencyMs < 0) {
      return c.json({
        success: false,
        message: 'A latência alvo de jitter em milissegundos é obrigatória.'
      }, 400);
    }

    const result = await sideChannelService.calibrateJitter(body);

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao calibrar jitter estocástico.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/update-policy
 * Atualiza o modo de proteção contra side-channel
 */
sideChannelRouter.post('/update-policy', async (c) => {
  try {
    const body = await c.req.json<UpdateSideChannelPolicyDTO>();

    if (!body.protectionMode) {
      return c.json({
        success: false,
        message: 'O modo de proteção side-channel é obrigatório.'
      }, 400);
    }

    const result = await sideChannelService.updatePolicy(body);

    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao atualizar política side-channel.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/simulate-timing-attack
 * Simula um ataque de timing / profiling contra a camada criptográfica
 */
sideChannelRouter.post('/simulate-timing-attack', async (c) => {
  try {
    const body = await c.req.json<SimulateTimingAttackDTO>();

    if (!body.targetOperation) {
      return c.json({
        success: false,
        message: 'A operação para simulação de timing attack é obrigatória.'
      }, 400);
    }

    const result = await sideChannelService.simulateTimingAttack(body);

    return c.json({
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao simular timing attack.'
    }, 500);
  }
});

/**
 * POST /api/side-channel/verify-seal
 * Valida a integridade do Selo Probatório WORM
 */
sideChannelRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifySideChannelSealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'O token do selo probatório é obrigatório.'
      }, 400);
    }

    const verification = sideChannelService.verifySeal(body);

    return c.json({
      ...verification
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao validar selo probatório.'
    }, 500);
  }
});
