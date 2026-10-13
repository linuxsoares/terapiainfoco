import { Hono } from 'hono';
import { kmsService } from '../services/kmsService';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole } from '@terapiainfoco/shared';
import type {
  RotateKmsKeyDTO,
  ReWrapDeksDTO,
  UpdateKmsPolicyDTO,
  RevokeKmsKeyDTO
} from '@terapiainfoco/shared';

export const kmsRoute = new Hono();

// Autenticação estrita requerida e restrição exclusiva a Administrador (NIST SP 800-57 & RFC §4.2)
kmsRoute.use('*', authMiddleware({ strict: true }));
const adminOnly = requireRoles([UserRole.ADMIN]);

// 1. Obter status geral de governança e ciclo de vida de chaves KMS
kmsRoute.get('/status', adminOnly, async (c) => {
  const status = await kmsService.getStatus();
  return c.json({ success: true, status });
});

// 2. Rotacionar Master Key (KEK) para uma nova versão criptográfica
kmsRoute.post('/rotate', adminOnly, async (c) => {
  const body = await c.req.json<RotateKmsKeyDTO>().catch(() => ({} as RotateKmsKeyDTO));
  const reason = body.reason || 'Rotação manual disparada via console administrativo (NIST SP 800-57)';
  const user = c.get('user');
  const actorId = user?.id || 'admin-user';
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const result = await kmsService.rotateKey(reason, actorId, ipAddress, body.reWrapExisting);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 3. Executar re-wrapping de DEKs legadas para a KEK mais recente
kmsRoute.post('/re-wrap', adminOnly, async (c) => {
  const body = await c.req.json<ReWrapDeksDTO>().catch(() => ({} as ReWrapDeksDTO));
  const user = c.get('user');
  const actorId = user?.id || 'admin-user';
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const result = await kmsService.reWrapAllDeks(body.targetKeyVersion, actorId, ipAddress);
    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 4. Atualizar política de rotação agendada automática
kmsRoute.put('/policy', adminOnly, async (c) => {
  const body = await c.req.json<UpdateKmsPolicyDTO>().catch(() => ({} as UpdateKmsPolicyDTO));
  const user = c.get('user');
  const actorId = user?.id || 'admin-user';
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const policy = await kmsService.updatePolicy(body, actorId, ipAddress);
    return c.json({
      success: true,
      policy,
      message: 'Política de rotação contínua KMS atualizada com sucesso.'
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 5. Revogar versão legada de chave KEK
kmsRoute.post('/revoke/:version', adminOnly, async (c) => {
  const versionParam = parseInt(c.req.param('version'), 10);
  if (isNaN(versionParam) || versionParam <= 0) {
    return c.json({ success: false, error: 'Versão de chave inválida.' }, 400);
  }

  const body = await c.req.json<RevokeKmsKeyDTO>().catch(() => ({} as RevokeKmsKeyDTO));
  const reason = body.reason || 'Revogação manual por política de segurança';
  const user = c.get('user');
  const actorId = user?.id || 'admin-user';
  const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const key = await kmsService.revokeKey(versionParam, reason, actorId, ipAddress);
    return c.json({
      success: true,
      key,
      message: `KEK versão ${versionParam} revogada com sucesso.`
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
