import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { rateLimiter } from '../middlewares/rateLimiter';
import { TherapistProfileRepository } from '../repositories/therapistProfileRepository';
import { AuditService } from '../services/auditService';
import {
  AuditAction,
  AuditResourceType,
  UserRole,
  type UpdateTherapistProfileDTO,
  type VerifyTherapistCrpDTO
} from '@terapiainfoco/shared';

export const therapistsRoute = new Hono();

const publicDirectoryRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Muitas buscas em curto período. Tente novamente em instantes.'
});

function requestContext(c: any) {
  return { ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1', userAgent: c.req.header('user-agent') };
}

// Busca pública de psicólogos (sem login): somente perfis publicados com CRP verificado
therapistsRoute.get('/search', publicDirectoryRateLimiter, async (c) => {
  const maxFee = c.req.query('maxFeeCents');
  const result = await TherapistProfileRepository.search({
    q: c.req.query('q')?.slice(0, 120),
    approach: c.req.query('approach') || undefined,
    specialty: c.req.query('specialty') || undefined,
    maxFeeCents: maxFee ? Number(maxFee) : undefined,
    page: Number(c.req.query('page')) || 1,
    pageSize: Number(c.req.query('pageSize')) || undefined
  });
  return c.json({ success: true, ...result });
});

// Perfil público do próprio psicólogo (edição)
therapistsRoute.get('/me/profile', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  const user = c.get('user');
  const profile = user.therapistId ? await TherapistProfileRepository.findByTherapistId(user.therapistId) : null;
  return c.json({ success: true, profile });
});

therapistsRoute.put('/me/profile', authMiddleware(), requireRoles([UserRole.PSICOLOGO_TITULAR]), async (c) => {
  const user = c.get('user');
  if (!user.therapistId) {
    return c.json({ success: false, error: 'Usuário sem consultório vinculado.' }, 403);
  }
  let body: UpdateTherapistProfileDTO;
  try {
    body = await c.req.json<UpdateTherapistProfileDTO>();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }

  try {
    const profile = await TherapistProfileRepository.upsertOwnProfile(
      { therapistId: user.therapistId, userId: user.id, name: user.name, crp: user.crp, crpRegion: user.crpRegion },
      body
    );
    AuditService.log({
      actorId: user.id,
      resourceType: AuditResourceType.USER,
      resourceId: user.therapistId,
      action: AuditAction.THERAPIST_PROFILE_UPDATED,
      ...requestContext(c)
    });
    return c.json({ success: true, profile });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

// Verificação de CRP pelo Admin/DPO (conferência no Cadastro Nacional do CFP)
therapistsRoute.get('/admin/pending', authMiddleware(), requireRoles([UserRole.ADMIN]), async (c) => {
  const profiles = await TherapistProfileRepository.listPendingVerification();
  return c.json({ success: true, profiles });
});

therapistsRoute.post('/admin/:therapistId/verify-crp', authMiddleware(), requireRoles([UserRole.ADMIN]), async (c) => {
  const therapistId = c.req.param('therapistId') ?? '';
  let body: VerifyTherapistCrpDTO;
  try {
    body = await c.req.json<VerifyTherapistCrpDTO>();
  } catch {
    return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  }
  if (typeof body.approved !== 'boolean') {
    return c.json({ success: false, error: 'Informe approved: true ou false.' }, 400);
  }

  const profile = await TherapistProfileRepository.setCrpVerification(therapistId, body.approved, c.get('userId'));
  if (!profile) {
    return c.json({ success: false, error: 'Perfil não encontrado.' }, 404);
  }
  AuditService.log({
    actorId: c.get('userId'),
    resourceType: AuditResourceType.USER,
    resourceId: therapistId,
    action: body.approved ? AuditAction.THERAPIST_CRP_VERIFIED : AuditAction.THERAPIST_CRP_REJECTED,
    ...requestContext(c)
  });
  return c.json({ success: true, profile });
});

// Página pública do psicólogo (registrada por último: captura qualquer slug)
therapistsRoute.get('/:slug', publicDirectoryRateLimiter, async (c) => {
  const profile = await TherapistProfileRepository.findPublicBySlug(c.req.param('slug') ?? '');
  if (!profile) {
    return c.json({ success: false, error: 'Psicólogo não encontrado.' }, 404);
  }
  return c.json({ success: true, profile });
});
