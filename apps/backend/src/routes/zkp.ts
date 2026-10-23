import { Hono } from 'hono';
import {
  UserRole,
  type GenerateZkpProofDTO,
  type VerifyZkpProofDTO,
  type ZkpProofResponse,
  type ZkpVerificationResponse,
  type ZkpProofListResponse
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { ZkpService } from '../services/zkpService';

export const zkpRoute = new Hono();

const service = ZkpService.getInstance();
// Ferramenta de operação da plataforma: só o Admin/DPO (RFC-001 §4.5)
const requireAdmin = requireRoles([UserRole.ADMIN]);

/**
 * 1. Gerar Prova de Conhecimento Zero para Documento/Prontuário Assinado
 */
zkpRoute.post('/generate', authMiddleware({ strict: true }), requireAdmin, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<GenerateZkpProofDTO>();

    if (!body.documentId || !body.documentTypeClaim) {
      return c.json({ success: false, message: 'documentId e documentTypeClaim são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    const proof = await service.generateProof({
      therapistId: user.id,
      dto: body,
      ipAddress,
      userAgent
    });

    const response: ZkpProofResponse = {
      success: true,
      proof,
      message: 'Prova Zero-Knowledge (Schnorr NIZK) gerada com sucesso e selada no ledger WORM.'
    };

    return c.json(response, 201);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 2. Verificar Prova de Conhecimento Zero (Endpoint Público Zero-Leakage)
 */
zkpRoute.post('/verify', async (c) => {
  try {
    const body = await c.req.json<VerifyZkpProofDTO>();

    if (!body.publicVerificationToken) {
      return c.json({ success: false, message: 'publicVerificationToken é obrigatório.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown';

    // Pode ser anônimo ou conter usuário autenticado
    let actorId = 'PUBLIC_VERIFIER';
    try {
      const authHeader = c.req.header('authorization');
      if (authHeader) {
        // Tenta extrair sem falhar se não houver
        const user = c.get('user');
        if (user?.id) actorId = user.id;
      }
    } catch {}

    const result = await service.verifyProof({
      dto: body,
      actorId,
      ipAddress,
      userAgent
    });

    const response: ZkpVerificationResponse = {
      success: result.valid,
      result,
      message: result.message
    };

    return c.json(response, result.valid ? 200 : 422);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * 3. Listar Provas ZKP Emitidas
 */
zkpRoute.get('/proofs', authMiddleware({ strict: true }), requireAdmin, (c) => {
  const proofs = service.listProofs();
  const metrics = service.getMetrics();

  const response: ZkpProofListResponse = {
    success: true,
    proofs,
    metrics
  };

  return c.json(response, 200);
});

/**
 * 4. Obter Métricas do Subsistema ZKP
 */
zkpRoute.get('/metrics', authMiddleware({ strict: true }), requireAdmin, (c) => {
  const metrics = service.getMetrics();
  return c.json({ success: true, metrics }, 200);
});
