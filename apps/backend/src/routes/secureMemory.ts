import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { secureMemoryService } from '../services/secureMemoryService';
import {
  type AllocateSecureBufferDTO,
  type ZeroizeSecureBufferDTO,
  type InspectHeapSprayingDTO,
  type VerifyZeroizationSealDTO,
  MemorySanitizationAlgorithm
} from '@terapiainfoco/shared';

export const secureMemoryRouter = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
secureMemoryRouter.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

/**
 * GET /api/secure-memory/overview
 * Visão Geral de Métricas, Blocos Ativos e Selos de Sanitização
 */
secureMemoryRouter.get('/overview', (c) => {
  try {
    const overview = secureMemoryService.getOverview();
    return c.json({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao obter overview de memória segura.'
    }, 500);
  }
});

/**
 * POST /api/secure-memory/allocate
 * Aloca um novo bloco protegido de memória segura
 */
secureMemoryRouter.post('/allocate', async (c) => {
  try {
    const body = await c.req.json<AllocateSecureBufferDTO>();
    if (!body.tag || !body.sizeBytes) {
      return c.json({
        success: false,
        message: 'Tag e tamanho em bytes (sizeBytes) são obrigatórios.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const block = await secureMemoryService.allocateSecureBuffer(
      body.tag,
      Number(body.sizeBytes),
      body.ttlMs ? Number(body.ttlMs) : 60000,
      body.initialContentHex,
      'admin-crypto-session',
      ip
    );

    return c.json({
      success: true,
      block,
      message: `Bloco seguro '${block.tag}' (${block.byteLength} bytes) alocado com sucesso (NIST SP 800-88 protegido).`
    }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao alocar bloco de memória segura.'
    }, 400);
  }
});

/**
 * POST /api/secure-memory/zeroize
 * Sanitiza e destrói um bloco de memória segura determinística
 */
secureMemoryRouter.post('/zeroize', async (c) => {
  try {
    const body = await c.req.json<ZeroizeSecureBufferDTO>();
    if (!body.blockId) {
      return c.json({
        success: false,
        message: 'blockId é obrigatório.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const algorithm = body.algorithm || MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE;

    const proofSeal = await secureMemoryService.zeroizeSecureBuffer(
      body.blockId,
      algorithm,
      'admin-crypto-session',
      ip
    );

    return c.json({
      success: true,
      proofSeal,
      message: `Bloco '${proofSeal.blockId}' sanitizado e zeroizado com sucesso (${proofSeal.passesCompleted} passos ${proofSeal.sanitizationAlgorithm}).`
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao sanitizar bloco de memória segura.'
    }, 400);
  }
});

/**
 * POST /api/secure-memory/inspect-heap-spraying
 * Inspeciona payloads de entrada contra ataques de Heap Spraying e Sleds
 */
secureMemoryRouter.post('/inspect-heap-spraying', async (c) => {
  try {
    const body = await c.req.json<InspectHeapSprayingDTO>();
    if (!body.payloadHexOrText) {
      return c.json({
        success: false,
        message: 'payloadHexOrText é obrigatório.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await secureMemoryService.inspectPayloadHeapSpraying(
      body.payloadHexOrText,
      body.sampleTag || 'API_PAYLOAD_SAMPLE',
      'security-firewall',
      ip
    );

    return c.json({
      success: true,
      inspection: result.inspection,
      auditLogged: result.auditLogged,
      message: result.inspection.isSprayingDetected
        ? 'Ataque de Heap Spraying interceptado e neutralizado pela blindagem de memória!'
        : 'Payload inspecionado e liberado: nenhuma anomalia de heap spraying detectada.'
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha na inspeção de heap spraying.'
    }, 400);
  }
});

/**
 * POST /api/secure-memory/purge-expired
 * Expurgamento forçado e imediato de DEKs expiradas
 */
secureMemoryRouter.post('/purge-expired', async (c) => {
  try {
    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await secureMemoryService.purgeExpiredDeks('cron-memory-purger', ip);

    return c.json({
      success: true,
      purgedCount: result.purgedCount,
      purgedBlockIds: result.purgedBlockIds,
      message: `Varredura concluída: ${result.purgedCount} blocos de DEK expirados sanitizados e purgados com sucesso.`
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao expurgar DEKs expiradas.'
    }, 500);
  }
});

/**
 * POST /api/secure-memory/verify-seal
 * Validação notarial independente de selo WORM de sanitização
 */
secureMemoryRouter.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyZeroizationSealDTO>();
    if (!body.proofSealToken) {
      return c.json({
        success: false,
        message: 'proofSealToken é obrigatório.'
      }, 400);
    }

    const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await secureMemoryService.verifyZeroizationSeal(
      body.proofSealToken,
      'admin-auditor',
      ip
    );

    return c.json({
      success: true,
      isValid: result.isValid,
      seal: result.seal,
      message: result.message,
      verifiedAt: result.verifiedAt
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: err.message || 'Falha ao validar selo probatório de sanitização.'
    }, 400);
  }
});
