/**
 * ============================================================================
 * 63. ROTAS REST: WEB CACHE POISONING & CACHE DECEPTION GUARD
 * ============================================================================
 * 
 * Endpoints de observabilidade, inspeção de requisições, mitigação de ameaças
 * de cache e simulação adversarial com conformidade RFC 7234, RFC 9111 e OWASP.
 */

import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { WebCacheGuardService } from '../services/webCacheGuardService';
import type {
  InspectCacheRequestDTO,
  InspectCacheResponseDTO,
  UpdateCachePolicyDTO,
  UpdateCachePolicyResponseDTO,
  SimulateCacheAttackDTO,
  SimulateCacheAttackResponseDTO,
  VerifyCacheSealDTO,
  VerifyCacheSealResponseDTO,
  CacheGuardOverviewResponse
} from '@terapiainfoco/shared';

const router = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
router.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = WebCacheGuardService.getInstance();

/**
 * GET /api/cache-guard/overview
 * Retorna visão geral de métricas, políticas ativas e incidentes recentes
 */
router.get('/overview', async (c) => {
  try {
    const overview = service.getOverview();
    return c.json<CacheGuardOverviewResponse>({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * POST /api/cache-guard/inspect
 * Inspeciona requisição HTTP contra envenenamento e engano de cache
 */
router.post('/inspect', async (c) => {
  try {
    const body = await c.req.json<InspectCacheRequestDTO>();
    const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const actorId = (c.get as any)('user')?.id || 'api-client';

    const inspection = await service.inspectRequest(body, clientIp, actorId);

    return c.json<InspectCacheResponseDTO>({
      success: true,
      inspection,
      message: inspection.isSafe
        ? 'Requisição validada com sucesso. Nenhuma vulnerabilidade de cache detectada.'
        : `Ameaças de cache interceptadas (${inspection.threats.length}). Cabeçalhos e sanitização aplicados.`
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * PUT /api/cache-guard/policy
 * Atualiza parâmetros de configuração da política de proteção de cache
 */
router.put('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateCachePolicyDTO>();
    const actorId = (c.get as any)('user')?.id || 'admin-user';

    const updated = await service.updatePolicy(body.policy || {}, actorId);

    return c.json<UpdateCachePolicyResponseDTO>({
      success: true,
      policy: updated,
      message: 'Política de segurança de cache atualizada com sucesso.'
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/cache-guard/simulate
 * Executa simulação adversarial de vetor de ataque de cache
 */
router.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateCacheAttackDTO>();
    const clientIp = c.req.header('x-forwarded-for') || '127.0.0.1';
    const actorId = (c.get as any)('user')?.id || 'adversarial-tester';

    const res = await service.simulateAttack(body, clientIp, actorId);
    return c.json<SimulateCacheAttackResponseDTO>(res);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/cache-guard/verify-seal
 * Valida a autenticidade criptográfica de um selo probatório WORM de cache
 */
router.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifyCacheSealDTO>();
    const actorId = (c.get as any)('user')?.id || 'seal-auditor';

    const res = await service.verifySeal(body.sealToken, actorId);
    return c.json<VerifyCacheSealResponseDTO>(res);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

export default router;
