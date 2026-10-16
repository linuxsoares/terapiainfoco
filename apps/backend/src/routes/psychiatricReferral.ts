import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { PsychiatricReferralService } from '../services/psychiatricReferralService';
import type {
  CheckDrugInteractionsDTO,
  CreatePsychiatricReferralDTO
} from '@terapiainfoco/shared';

export const psychiatricReferralRouter = new Hono();

/**
 * GET /api/psychiatric-referrals/catalog
 * Retorna o catálogo farmacológico completo dos psicofármacos comuns no Brasil
 */
psychiatricReferralRouter.get('/catalog', authMiddleware(), (c) => {
  const drugs = PsychiatricReferralService.getCatalog();
  return c.json({
    success: true,
    drugs,
    total: drugs.length
  });
});

/**
 * POST /api/psychiatric-referrals/check-interactions
 * Avalia interações medicamentosas cruzadas entre os fármacos selecionados
 */
psychiatricReferralRouter.post('/check-interactions', authMiddleware(), async (c) => {
  try {
    const user = c.get('user');
    const actorId = user?.therapistId || user?.id || 'therapist-001';
    const body = await c.req.json<CheckDrugInteractionsDTO>();

    if (!body || !Array.isArray(body.drugIds)) {
      return c.json(
        {
          success: false,
          error: 'Parâmetro obrigatório "drugIds" deve ser um array de identificadores de fármacos.'
        },
        400
      );
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = PsychiatricReferralService.checkInteractions(body.drugIds, {
      actorId,
      ipAddress
    });

    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao avaliar interações medicamentosas'
      },
      400
    );
  }
});

/**
 * POST /api/psychiatric-referrals
 * Cria e emite a Guia de Encaminhamento Psiquiátrico Interoperável
 */
psychiatricReferralRouter.post('/', authMiddleware(), async (c) => {
  try {
    const user = c.get('user');
    const therapistId = user?.therapistId || user?.id || 'therapist-001';
    const therapistName = user?.name || 'Dr. Terapeuta Responsável';
    const therapistCrp = user?.crp || 'CRP 06/123456';
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const body = await c.req.json<CreatePsychiatricReferralDTO>();

    if (!body.patientId || !body.reasonForReferral || !body.clinicalHypothesesCid11) {
      return c.json(
        {
          success: false,
          error: 'Campos obrigatórios: patientId, reasonForReferral e clinicalHypothesesCid11.'
        },
        400
      );
    }

    const result = PsychiatricReferralService.createReferral({
      therapistId,
      therapistName,
      therapistCrp,
      dto: body,
      ipAddress
    });

    return c.json(result, 201);
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao emitir guia de encaminhamento psiquiátrico'
      },
      error.message?.includes('não encontrado') ? 404 : 400
    );
  }
});

/**
 * GET /api/psychiatric-referrals/patients/:patientId
 * Lista os encaminhamentos psiquiátricos emitidos para o paciente especificado
 */
psychiatricReferralRouter.get('/patients/:patientId', authMiddleware(), (c) => {
  try {
    const { patientId } = c.req.param();
    const referrals = PsychiatricReferralService.listPatientReferrals(patientId);

    return c.json({
      success: true,
      referrals,
      total: referrals.length
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || 'Erro ao listar encaminhamentos do paciente'
      },
      500
    );
  }
});

/**
 * GET /api/psychiatric-referrals/validate/:token
 * Validação pública da autenticidade da guia pelo médico psiquiatra externo
 */
psychiatricReferralRouter.get('/validate/:token', (c) => {
  const { token } = c.req.param();
  const validation = PsychiatricReferralService.getReferralByToken(token);

  if (!validation.isValid) {
    return c.json(
      {
        success: false,
        isValid: false,
        message: 'Guia de encaminhamento psiquiátrico não encontrada ou token inválido.'
      },
      404
    );
  }

  return c.json({
    success: true,
    isValid: true,
    referral: validation.referral,
    message: 'Guia de encaminhamento psiquiátrico autêntica, íntegra e verificada com sucesso.'
  });
});
