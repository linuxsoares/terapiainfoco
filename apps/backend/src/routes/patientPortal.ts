import { Hono, type Context, type Next } from 'hono';
import { verify } from 'hono/jwt';
import {
  type AssignExerciseDTO,
  type SubmitExerciseResponseDTO,
  type ReviewExerciseDTO,
  UserRole
} from '@terapiainfoco/shared';
import { PatientPortalService } from '../services/patientPortalService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, canAccessEntity, requireBodyOwnership, requirePatientAccess } from '../middlewares/accessPolicy';
import { validationRateLimiter } from '../middlewares/rateLimiter';
import { config } from '../config';
import { db } from '../db/memoryDb';

export const patientPortalRouter = new Hono();

/**
 * Middleware para validar token de sessão do Portal do Paciente
 */
interface PatientSession {
  patientId: string;
  email: string;
  name: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    patientSession: PatientSession;
  }
}

const patientAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'Autenticação de paciente obrigatória.' }, 401);
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = (await verify(token, config.jwtSecret, 'HS256')) as any;
    // Só o token do portal (código por e-mail) ou o access token de uma conta de paciente com prontuário:
    // refresh tokens e tokens de outros perfis não abrem o portal
    const isPortalToken = payload?.type === 'patient_portal_token';
    const isPatientAccess = payload?.type === 'access' && payload?.role === UserRole.PACIENTE;
    if (!payload?.patientId || (!isPortalToken && !isPatientAccess)) {
      return c.json({ success: false, message: 'Token de paciente inválido.' }, 401);
    }
    c.set('patientSession', {
      patientId: payload.patientId as string,
      email: payload.email as string,
      name: payload.name as string
    });
    await next();
  } catch {
    return c.json({ success: false, message: 'Sessão de paciente expirada ou inválida.' }, 401);
  }
};

/**
 * POST /api/patient-portal/auth/request-code
 * Solicita envio de código de acesso temporário por e-mail
 */
patientPortalRouter.post('/auth/request-code', validationRateLimiter, async (c) => {
  try {
    const body = await c.req.json<{ email: string }>();
    if (!body.email || !body.email.includes('@')) {
      return c.json({ success: false, message: 'E-mail válido é obrigatório.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await PatientPortalService.requestAccessCode(body.email, ipAddress);

    return c.json(result, result.success ? 200 : 404);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * POST /api/patient-portal/auth/verify-code
 * Valida o código de 6 dígitos e emite token de acesso
 */
patientPortalRouter.post('/auth/verify-code', validationRateLimiter, async (c) => {
  try {
    const body = await c.req.json<{ email: string; code: string }>();
    if (!body.email || !body.code) {
      return c.json({ success: false, message: 'E-mail e código são obrigatórios.' }, 400);
    }

    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const result = await PatientPortalService.verifyAccessCode(body.email, body.code, ipAddress);

    return c.json(result, result.success ? 200 : 401);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/**
 * ==========================================
 * ROTAS AUTENTICADAS DO PORTAL DO PACIENTE
 * ==========================================
 */

/**
 * GET /api/patient-portal/overview
 * Resumo consolidado do paciente (consultas, exercícios, recibos)
 */
patientPortalRouter.get('/overview', patientAuthMiddleware, async (c) => {
  try {
    const session = c.get('patientSession');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const overview = await PatientPortalService.getPatientPortalOverview(session.patientId, {
      actorId: session.patientId,
      ipAddress
    });

    return c.json({ success: true, data: overview }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * GET /api/patient-portal/exercises
 * Lista exercícios terapêuticos do paciente
 */
patientPortalRouter.get('/exercises', patientAuthMiddleware, async (c) => {
  try {
    const session = c.get('patientSession');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const exercises = PatientPortalService.listPatientExercises(session.patientId, {
      actorId: session.patientId,
      ipAddress
    });

    return c.json({ success: true, exercises, total: exercises.length }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * POST /api/patient-portal/exercises/submit
 * Paciente submete resolução de exercício com cifragem AES-256-GCM
 */
patientPortalRouter.post('/exercises/submit', patientAuthMiddleware, async (c) => {
  try {
    const session = c.get('patientSession');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
    const body = await c.req.json<SubmitExerciseResponseDTO>();

    if (!body.exerciseId || !body.answers) {
      return c.json({ success: false, message: 'exerciseId e answers são obrigatórios.' }, 400);
    }

    const updated = await PatientPortalService.submitExerciseResponse({
      patientId: session.patientId,
      dto: body,
      context: {
        actorId: session.patientId,
        ipAddress
      }
    });

    return c.json({ success: true, exercise: updated, message: 'Exercício completado e submetido com sucesso!' }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * GET /api/patient-portal/receipts
 * Lista recibos de honorários para reembolso de convênio
 */
patientPortalRouter.get('/receipts', patientAuthMiddleware, async (c) => {
  try {
    const session = c.get('patientSession');
    const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

    const receipts = await PatientPortalService.listPatientReceipts(session.patientId, {
      actorId: session.patientId,
      ipAddress
    });

    return c.json({ success: true, receipts, total: receipts.length }, 200);
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 400);
  }
});

/**
 * ==========================================
 * ROTAS DO TERAPEUTA (PRESCRITOR & REVISOR)
 * ==========================================
 */

/**
 * POST /api/patient-portal/therapist/assign
 * Terapeuta prescreve exercício para paciente
 */
patientPortalRouter.post(
  '/therapist/assign',
  authMiddleware(),
  requireRole(CLINICAL_ROLES),
  requireBodyOwnership(),
  async (c) => {
    try {
      const user = c.get('user');
      const body = await c.req.json<AssignExerciseDTO>();

      if (!body.patientId || !body.title || !body.type) {
        return c.json({ success: false, message: 'patientId, title e type são obrigatórios.' }, 400);
      }

      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const therapistId = user.therapistId;
      if (!therapistId) return c.json({ success: false, message: 'Conta sem consultório vinculado.' }, 403);

      const exercise = await PatientPortalService.assignExercise({
        therapistId,
        dto: body,
        context: {
          actorId: user.id,
          ipAddress
        }
      });

      return c.json({ success: true, exercise, message: 'Exercício terapêutico prescrito com sucesso.' }, 201);
    } catch (err: any) {
      return c.json({ success: false, message: err.message }, 400);
    }
  }
);

/**
 * GET /api/patient-portal/therapist/patient/:patientId/exercises
 * Terapeuta consulta histórico de exercícios de um paciente
 */
patientPortalRouter.get(
  '/therapist/patient/:patientId/exercises',
  authMiddleware(),
  requireRole(CLINICAL_ROLES),
  requirePatientAccess('patientId'),
  async (c) => {
    try {
      const user = c.get('user');
      const patientId = c.req.param('patientId');
      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';

      const exercises = PatientPortalService.listPatientExercises(patientId, {
        actorId: user.id,
        ipAddress
      });

      return c.json({ success: true, exercises, total: exercises.length }, 200);
    } catch (err: any) {
      return c.json({ success: false, message: err.message }, 400);
    }
  }
);

/**
 * POST /api/patient-portal/therapist/review
 * Terapeuta adiciona feedback clínico em exercício resolvido
 */
patientPortalRouter.post(
  '/therapist/review',
  authMiddleware(),
  requireRole(CLINICAL_ROLES),
  async (c) => {
    try {
      const user = c.get('user');
      const body = await c.req.json<ReviewExerciseDTO>();

      if (!body.exerciseId || !body.feedback) {
        return c.json({ success: false, message: 'exerciseId e feedback são obrigatórios.' }, 400);
      }
      if (!(await canAccessEntity(user, db.therapeuticExercises.get(body.exerciseId)))) {
        return c.json({ success: false, message: 'Exercício não encontrado.' }, 404);
      }

      const ipAddress = c.req.header('x-forwarded-for') || '127.0.0.1';
      const therapistId = user.therapistId;
      if (!therapistId) return c.json({ success: false, message: 'Conta sem consultório vinculado.' }, 403);

      const updated = await PatientPortalService.reviewExercise({
        therapistId,
        dto: body,
        context: {
          actorId: user.id,
          ipAddress
        }
      });

      return c.json({ success: true, exercise: updated, message: 'Feedback clínico registrado com sucesso.' }, 200);
    } catch (err: any) {
      return c.json({ success: false, message: err.message }, 400);
    }
  }
);
