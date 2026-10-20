/**
 * ============================================================================
 * 65. ROTAS REST: SESSION FIXATION & HIJACKING GUARD
 * ============================================================================
 * 
 * Endpoints de avaliação contínua de sessão, rotação pós-autenticação,
 * governança de políticas de context binding e simulação adversarial (OWASP ASVS V3.3).
 */

import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import { SessionFixationGuardService } from '../services/sessionFixationGuardService';
import type {
  EvaluateSessionDTO,
  EvaluateSessionResponse,
  RotateSessionDTO,
  RotateSessionResponse,
  UpdateSessionGuardPolicyDTO,
  UpdateSessionGuardPolicyResponse,
  SimulateSessionAttackDTO,
  SimulateSessionAttackResponse,
  VerifySessionSealDTO,
  VerifySessionSealResponse,
  SessionGuardOverviewResponse
} from '@terapiainfoco/shared';

const router = new Hono();

// Ferramenta da plataforma (painel de Segurança): exclusiva do Admin
router.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));
const service = SessionFixationGuardService.getInstance();

/**
 * GET /api/session-guard/overview
 * Retorna telemetria, políticas ativas e incidentes recentes de sequestro de sessão
 */
router.get('/overview', async (c) => {
  try {
    const overview = service.getOverview();
    return c.json<SessionGuardOverviewResponse>({
      success: true,
      overview
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * POST /api/session-guard/evaluate
 * Avalia o contexto da sessão do cliente contra mutações suspeitas
 */
router.post('/evaluate', async (c) => {
  try {
    const body = await c.req.json<EvaluateSessionDTO>();
    if (!body || !body.sessionId) {
      return c.json({ success: false, message: 'sessionId é obrigatório.' }, 400);
    }

    const clientIp = body.clientIp || c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = body.userAgent || c.req.header('user-agent') || 'Unknown';
    const actorId = (c.get as any)('user')?.id || 'clinical-user';

    const response = await service.evaluateSession({
      ...body,
      clientIp,
      userAgent
    }, actorId);

    return c.json<EvaluateSessionResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/session-guard/rotate
 * Executa rotação criptográfica forçada da sessão (login / elevação de privilégio)
 */
router.post('/rotate', async (c) => {
  try {
    const body = await c.req.json<RotateSessionDTO>();
    if (!body || !body.oldSessionId || !body.userId) {
      return c.json({ success: false, message: 'oldSessionId e userId são obrigatórios.' }, 400);
    }

    const clientIp = body.clientIp || c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = body.userAgent || c.req.header('user-agent') || 'Unknown';
    const actorId = (c.get as any)('user')?.id || body.userId;

    const response = await service.rotateSession({
      ...body,
      clientIp,
      userAgent
    }, actorId);

    return c.json<RotateSessionResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * PUT /api/session-guard/policy
 * Atualiza políticas operacionais de proteção de sessão
 */
router.put('/policy', async (c) => {
  try {
    const body = await c.req.json<UpdateSessionGuardPolicyDTO>();
    const actorId = (c.get as any)('user')?.id || 'security-officer';

    const response = await service.updatePolicy(body, actorId);
    return c.json<UpdateSessionGuardPolicyResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/session-guard/simulate
 * Simula ataques adversariais de sequestro ou fixação de sessão
 */
router.post('/simulate', async (c) => {
  try {
    const body = await c.req.json<SimulateSessionAttackDTO>();
    const actorId = (c.get as any)('user')?.id || 'pentest-analyst';

    const response = await service.simulateAttack(body, actorId);
    return c.json<SimulateSessionAttackResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/session-guard/verify-seal
 * Valida a integridade matemática de um selo probatório RFC 8785 WORM de sessão
 */
router.post('/verify-seal', async (c) => {
  try {
    const body = await c.req.json<VerifySessionSealDTO>();
    if (!body || !body.sealToken) {
      return c.json({ success: false, message: 'sealToken é obrigatório.' }, 400);
    }

    const actorId = (c.get as any)('user')?.id || 'seal-auditor';
    const response = await service.verifySeal(body, actorId);
    return c.json<VerifySessionSealResponse>(response);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

export default router;
