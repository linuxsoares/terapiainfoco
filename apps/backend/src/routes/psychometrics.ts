import { Hono } from 'hono';
import { 
  PsychometricScaleType,
  type SubmitPsychometricAssessmentDTO
} from '@terapiainfoco/shared';
import { PsychometricService } from '../services/psychometricService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, requireBodyOwnership, requirePatientAccess } from '../middlewares/accessPolicy';

export const psychometricsRouter = new Hono();

psychometricsRouter.use('*', authMiddleware(), requireRole(CLINICAL_ROLES), requireBodyOwnership());

/**
 * GET /api/psychometrics/definition/:scaleType
 * Retorna as perguntas e opções da escala (PHQ-9 ou GAD-7)
 */
psychometricsRouter.get('/definition/:scaleType', async (c) => {
  try {
    const scaleType = c.req.param('scaleType').toUpperCase() as PsychometricScaleType;
    if (scaleType !== PsychometricScaleType.PHQ9 && scaleType !== PsychometricScaleType.GAD7) {
      return c.json({ success: false, error: 'Escala inválida. Use PHQ9 ou GAD7.' }, 400);
    }

    const definition = PsychometricService.getScaleDefinition(scaleType);
    return c.json({ success: true, definition });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * POST /api/psychometrics/submit
 * Submete avaliação psicométrica com cálculo automático de gravidade, interpretação e tendências
 */
psychometricsRouter.post('/submit', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<SubmitPsychometricAssessmentDTO>();

    if (!body.patientId || !body.scaleType || !body.answers || !Array.isArray(body.answers)) {
      return c.json({ success: false, error: 'patientId, scaleType e answers são obrigatórios' }, 400);
    }

    const result = PsychometricService.submitAssessment(body, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/psychometrics/patient/:patientId
 * Lista histórico de avaliações do paciente (com filtro opcional por escala)
 */
psychometricsRouter.get('/patient/:patientId', requirePatientAccess('patientId'), async (c) => {
  try {
    const patientId = c.req.param('patientId');
    const scale = c.req.query('scale')?.toUpperCase() as PsychometricScaleType | undefined;

    const assessments = PsychometricService.getPatientAssessments(patientId, scale);
    return c.json({ success: true, assessments });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
