import { Hono } from 'hono';
import {
  UserRole,
  type CreateClinicalReferralDTO,
  type CounterReferralDTO
} from '@terapiainfoco/shared';
import { ClinicalReferralService } from '../services/clinicalReferralService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, canAccessEntity, requireBodyOwnership, requireOwnedResource, requirePatientAccess } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';
import { validationRateLimiter } from '../middlewares/rateLimiter';

export const clinicalReferralsRouter = new Hono();

/**
 * GET /api/referrals/validate/:token
 * Endpoint PÚBLICO de verificação de autenticidade da guia de encaminhamento (RFC-001 §3.5)
 * Protegido contra enumeração e força bruta via validationRateLimiter
 * Preserva o sigilo profissional (Código de Ética CFP Art. 9º e LGPD Art. 11)
 */
clinicalReferralsRouter.get('/validate/:token', validationRateLimiter, async (c) => {
  try {
    const token = c.req.param('token');
    const result = ClinicalReferralService.validatePublicReferral(token);

    if (!result.valid) {
      return c.json(result, 404);
    }

    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ success: false, valid: false, message: err.message }, 400);
  }
});

/**
 * Rotas autenticadas para gestão clínica de encaminhamentos
 */
clinicalReferralsRouter.use('*', authMiddleware(), requireRole(CLINICAL_ROLES), requireBodyOwnership());

/**
 * POST /api/referrals
 * Cria nova guia de encaminhamento multidisciplinar interoperável
 */
clinicalReferralsRouter.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateClinicalReferralDTO>();

    if (!body.patientId || !body.recipientProfessional || !body.recipientSpecialty || !body.urgency || !body.clinicalSummary || !body.reasonForReferral) {
      return c.json({
        success: false,
        error: 'Campos obrigatórios: patientId, recipientProfessional, recipientSpecialty, urgency, clinicalSummary e reasonForReferral'
      }, 400);
    }

    const therapistId = user.therapistId!;
    const referral = ClinicalReferralService.createReferral({
      therapistId,
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, referral, message: 'Guia de encaminhamento emitida com sucesso.' }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/referrals/counter-reference
 * Registra retorno ou parecer da contra-referência médica / psiquiátrica
 */
clinicalReferralsRouter.post('/counter-reference', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CounterReferralDTO>();

    if (!body.referralId || !body.counterReferenceNotes || !body.counterReferredBy) {
      return c.json({
        success: false,
        error: 'Campos obrigatórios: referralId, counterReferenceNotes e counterReferredBy'
      }, 400);
    }
    if (!canAccessEntity(c.get('user'), db.clinicalReferrals.get(body.referralId))) {
      return c.json({ success: false, error: 'Encaminhamento não encontrado.' }, 404);
    }

    const referral = ClinicalReferralService.registerCounterReferral({
      dto: body,
      context: {
        actorId: user.id,
        ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
        userAgent: c.req.header('user-agent')
      }
    });

    return c.json({ success: true, referral, message: 'Contra-referência registrada com sucesso.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/referrals/:referralId
 * Obtém os detalhes completos decriptados do encaminhamento
 */
clinicalReferralsRouter.get('/:referralId', requireOwnedResource((id) => db.clinicalReferrals.get(id), 'Encaminhamento', 'referralId'), async (c) => {
  try {
    const user = c.get('user');
    const referralId = c.req.param('referralId');

    const referral = ClinicalReferralService.getById(referralId, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    if (!referral) {
      return c.json({ success: false, error: 'Encaminhamento não encontrado' }, 404);
    }

    return c.json({ success: true, referral });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/referrals/patient/:patientId
 * Lista todos os encaminhamentos de um paciente
 */
clinicalReferralsRouter.get('/patient/:patientId', requirePatientAccess('patientId'), async (c) => {
  try {
    const user = c.get('user');
    const patientId = c.req.param('patientId');

    const referrals = ClinicalReferralService.listByPatient(patientId, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, referrals, total: referrals.length });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
