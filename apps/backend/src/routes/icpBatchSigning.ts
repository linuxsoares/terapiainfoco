import { Hono } from 'hono';
import {
  type PrepareBatchClosingDTO,
  type ExecuteBatchSignatureDTO,
  type VerifyIcpBatchDTO,
  UserRole
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { icpBatchSigningService } from '../services/icpBatchSigningService';

export const icpBatchSigningRouter = new Hono();

/**
 * POST /api/icp-batch/verify
 * Validação Notarial Pública do Lote (Acesso anônimo permitido com token para convênios e juízos)
 */
icpBatchSigningRouter.post('/verify', async (c) => {
  try {
    const dto = await c.req.json<VerifyIcpBatchDTO>();
    if (!dto.publicValidationToken) {
      return c.json({
        success: false,
        valid: false,
        details: 'publicValidationToken é obrigatório.'
      }, 400);
    }

    const result = await icpBatchSigningService.verifyIcpBatch(dto.publicValidationToken);
    return c.json({
      success: true,
      valid: result.valid,
      manifest: result.manifest,
      verifiedAt: new Date().toISOString(),
      details: result.details
    }, result.valid ? 200 : 400);
  } catch (error: any) {
    return c.json({
      success: false,
      valid: false,
      details: error.message || 'Erro ao validar lote ICP-Brasil.'
    }, 500);
  }
});

// A partir daqui, todos os endpoints administrativos requerem autenticação
icpBatchSigningRouter.use('*', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]));

/**
 * GET /api/icp-batch/pending-items
 * Lista itens clínicos e documentos pendentes de assinatura do terapeuta
 */
icpBatchSigningRouter.get('/pending-items', async (c) => {
  try {
    const user = c.get('user');
    const items = await icpBatchSigningService.findUnsignedClinicalItems(user.therapistId || user.id);

    return c.json({
      success: true,
      items,
      totalPendingCount: items.length
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao buscar itens pendentes de assinatura.'
    }, 500);
  }
});

/**
 * POST /api/icp-batch/prepare
 * Prepara manifesto preliminar e calcula Merkle Root do lote selecionado
 */
icpBatchSigningRouter.post('/prepare', async (c) => {
  try {
    const user = c.get('user');
    const dto = await c.req.json<PrepareBatchClosingDTO>();

    const manifest = await icpBatchSigningService.prepareBatchManifest(
      dto,
      user.therapistId || user.id,
      user.name,
      user.crp || ''
    );

    return c.json({
      success: true,
      manifest,
      message: 'Manifesto de lote preparado com sucesso.'
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao preparar manifesto de lote.'
    }, 500);
  }
});

/**
 * POST /api/icp-batch/sign
 * Assina e sela o lote com Certificado Digital ICP-Brasil (PAdES) e Carimbo do Tempo TSA
 */
icpBatchSigningRouter.post('/sign', async (c) => {
  try {
    const user = c.get('user');
    const dto = await c.req.json<ExecuteBatchSignatureDTO>();

    const result = await icpBatchSigningService.signBatchWithIcp(
      dto,
      user.therapistId || user.id,
      user.name,
      user.crp || ''
    );

    return c.json({
      success: true,
      manifest: result.manifest,
      sealedRecordsCount: result.sealedRecordsCount,
      message: `Lote de ${result.sealedRecordsCount} registros clínicos selado com sucesso via ICP-Brasil e carimbo do tempo TSA.`
    }, 200);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao assinar lote com certificado ICP-Brasil.'
    }, 400);
  }
});

/**
 * GET /api/icp-batch/manifests
 * Lista todos os manifestos de fechamento de ciclo do profissional
 */
icpBatchSigningRouter.get('/manifests', async (c) => {
  try {
    const user = c.get('user');
    const manifests = await icpBatchSigningService.listManifests(user.therapistId || user.id);

    return c.json({
      success: true,
      manifests,
      totalCount: manifests.length
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Erro ao listar manifestos de fechamento.'
    }, 500);
  }
});
