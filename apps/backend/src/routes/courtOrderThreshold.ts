import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { CourtOrderThresholdService } from '../services/courtOrderThresholdService';
import type {
  CreateCourtOrderVaultDTO,
  SubmitCustodianShareDTO,
  ReconstructAndDecryptDTO,
  SimulateThresholdAttackDTO,
  VerifyThresholdSealDTO
} from '@terapiainfoco/shared';

export const courtOrderThresholdRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
courtOrderThresholdRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = CourtOrderThresholdService.getInstance();

/**
 * GET /api/court-order-threshold/overview
 * Retorna telemetria dos cofres de ordem judicial e métricas de quorum
 */
courtOrderThresholdRouter.get('/overview', (c) => {
  try {
    const overview = service.getOverview();
    return c.json({
      success: true,
      overview
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao carregar visão geral de cofres judiciais'
    }, 500);
  }
});

/**
 * POST /api/court-order-threshold/create-vault
 * Sela um prontuário confidencial sob ordem judicial e distribui cotas Shamir
 */
courtOrderThresholdRouter.post('/create-vault', async (c) => {
  try {
    const body = await c.req.json<CreateCourtOrderVaultDTO>();
    if (!body.patientId || !body.legalCaseNumber || !body.secretRecordText) {
      return c.json({
        success: false,
        message: 'Parâmetros obrigatórios ausentes: patientId, legalCaseNumber e secretRecordText.'
      }, 400);
    }

    const response = service.createVault(body);
    return c.json(response, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao criar cofre judicial'
    }, 400);
  }
});

/**
 * POST /api/court-order-threshold/submit-share
 * Submete uma cota de custodiante legal para integrar o quorum
 */
courtOrderThresholdRouter.post('/submit-share', async (c) => {
  try {
    const body = await c.req.json<SubmitCustodianShareDTO>();
    if (!body.vaultId || !body.shareIndex || !body.shareData || !body.custodianRole) {
      return c.json({
        success: false,
        message: 'Parâmetros obrigatórios ausentes: vaultId, shareIndex, shareData e custodianRole.'
      }, 400);
    }

    const response = service.submitCustodianShare(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao submeter cota de custodiante'
    }, 400);
  }
});

/**
 * POST /api/court-order-threshold/reconstruct-decrypt
 * Executa a interpolação polinomial com as cotas submetidas e decifra o prontuário
 */
courtOrderThresholdRouter.post('/reconstruct-decrypt', async (c) => {
  try {
    const body = await c.req.json<ReconstructAndDecryptDTO>();
    if (!body.vaultId) {
      return c.json({
        success: false,
        message: 'Parâmetro vaultId obrigatório.'
      }, 400);
    }

    const response = service.reconstructAndDecrypt(body.vaultId);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao reconstruir chave de ordem judicial'
    }, 400);
  }
});

/**
 * POST /api/court-order-threshold/simulate-attack
 * Executa simulação adversarial contra o protocolo de Threshold Cryptography
 */
courtOrderThresholdRouter.post('/simulate-attack', async (c) => {
  try {
    const body = await c.req.json<SimulateThresholdAttackDTO>();
    if (!body.scenario) {
      return c.json({
        success: false,
        message: 'Parâmetro scenario obrigatório.'
      }, 400);
    }

    const response = service.simulateThresholdAttack(body);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao executar simulação de ataque'
    }, 400);
  }
});

/**
 * POST /api/court-order-threshold/verify-seal
 * Validação pericial de fé pública de selo probatório WORM
 */
courtOrderThresholdRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyThresholdSealDTO>();
    if (!body.sealToken) {
      return c.json({
        success: false,
        message: 'Parâmetro sealToken obrigatório.'
      }, 400);
    }

    const response = service.verifySeal(body.sealToken);
    return c.json(response, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao verificar selo probatório'
    }, 400);
  }
});
