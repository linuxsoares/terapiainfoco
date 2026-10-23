import { Hono } from 'hono';
import { UserRole } from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { VisualWatermarkService } from '../services/visualWatermarkService';
import type {
  CreateWatermarkSeedDTO,
  EmbedVisualWatermarkDTO,
  ExtractLeakSourceDTO,
  SimulateScreenLeakDTO,
  UpdateWatermarkStrengthDTO,
  VerifyVisualWatermarkSealDTO
} from '@terapiainfoco/shared';

export const visualWatermarkRouter = new Hono();
// Painel de marca d'água forense da plataforma: só o Admin/DPO (RFC-001 §4.5)
visualWatermarkRouter.use('*', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]));
const service = VisualWatermarkService.getInstance();

/**
 * GET /api/visual-watermark/overview
 * Retorna visão geral de sementes ativas, métricas agregadas e incidentes forenses
 */
visualWatermarkRouter.get('/overview', async (c) => {
  try {
    const overview = service.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao buscar visão geral de marcas d\'água visuais.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/create-seed
 * Gera nova semente espectral vinculada à teleconsulta
 */
visualWatermarkRouter.post('/create-seed', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateWatermarkSeedDTO>();

    if (!body.therapistCrp || !body.patientId) {
      return c.json({
        success: false,
        message: 'CRP do profissional e identificador do paciente são obrigatórios.'
      }, 400);
    }

    const seed = await service.createSeed(body, user?.id || 'anonymous_user');
    return c.json({
      success: true,
      seed,
      message: `Semente criptográfica '${seed.seedId}' gerada com sucesso para a sessão.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao criar semente de marca d\'água.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/embed
 * Injeta a marca d'água no quadro de vídeo ou tela clínica
 */
visualWatermarkRouter.post('/embed', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<EmbedVisualWatermarkDTO>();

    if (!body.seedId) {
      return c.json({
        success: false,
        message: 'Identificador da semente é obrigatório.'
      }, 400);
    }

    const result = await service.embedWatermark(body, user?.id || 'anonymous_user');
    return c.json({
      success: true,
      result,
      message: `Marca d'água injetada com sucesso! PSNR: ${result.psnrDb}dB, SSIM: ${result.ssimScore}.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao injetar marca d\'água no quadro.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/extract-leak
 * Realiza perícia forense em imagem suspeita para rastrear origem do vazamento
 */
visualWatermarkRouter.post('/extract-leak', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<ExtractLeakSourceDTO>();

    if (!body.suspectFrameData) {
      return c.json({
        success: false,
        message: 'Dados do frame suspeito são obrigatórios.'
      }, 400);
    }

    const result = await service.extractLeak(body, user?.id || 'anonymous_user');
    return c.json({
      success: true,
      result,
      message: result.forensicAnalysis
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao extrair marca d\'água e rastrear autoria.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/simulate-screen-leak
 * Simula ataque de captura de tela recortada com teste de sobrevivência esteganográfica
 */
visualWatermarkRouter.post('/simulate-screen-leak', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<SimulateScreenLeakDTO>();

    if (!body.seedId) {
      return c.json({
        success: false,
        message: 'Informe a semente de marca d\'água para o teste de resiliência.'
      }, 400);
    }

    const simulation = await service.simulateScreenLeak(body, user?.id || 'anonymous_user');
    return c.json({
      success: true,
      simulation,
      message: simulation.survivedAnalysis
        ? `Ataque neutralizado! A marca d'água sobreviveu com NCC ${simulation.extractionResult.correlationScore.toFixed(4)}.`
        : 'A marca d\'água foi degradada abaixo do limiar de correlação.'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao executar simulação de exfiltração de tela.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/update-strength
 * Atualiza a intensidade operacional de injeção da marca d'água
 */
visualWatermarkRouter.post('/update-strength', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<UpdateWatermarkStrengthDTO>();

    if (!body.strength) {
      return c.json({
        success: false,
        message: 'Nova intensidade de marca d\'água é obrigatória.'
      }, 400);
    }

    const activeStrength = await service.updateStrength(body, user?.id || 'anonymous_user');
    return c.json({
      success: true,
      activeStrength,
      message: `Intensidade de injeção esteganográfica atualizada para '${activeStrength}'.`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Falha ao atualizar intensidade da marca d\'água.'
    }, 500);
  }
});

/**
 * POST /api/visual-watermark/verify-seal
 * Valida a autenticidade e integridade WORM de um selo probatório visual
 */
visualWatermarkRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyVisualWatermarkSealDTO>();

    if (!body.sealToken) {
      return c.json({
        success: false,
        isValid: false,
        message: 'Token do selo probatório é obrigatório.',
        verifiedAt: new Date().toISOString()
      }, 400);
    }

    const verification = service.verifySeal(body);
    return c.json({
      success: true,
      ...verification
    });
  } catch (error: any) {
    return c.json({
      success: false,
      isValid: false,
      message: error.message || 'Falha ao verificar selo probatório visual.',
      verifiedAt: new Date().toISOString()
    }, 500);
  }
});

export { visualWatermarkRouter as visualWatermarkRoutes };
