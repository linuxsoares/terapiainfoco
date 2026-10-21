import { Hono } from 'hono';
import { 
  type CreateTherapeuticGoalDTO,
  type UpdateTherapeuticGoalDTO
} from '@terapiainfoco/shared';
import { GoalService } from '../services/goalService';
import { authMiddleware, requireRole } from '../middlewares/authMiddleware';
import { CLINICAL_ROLES, requireBodyOwnership, requireOwnedResource, requirePatientAccess } from '../middlewares/accessPolicy';
import { db } from '../db/memoryDb';

export const therapeuticGoalsRouter = new Hono();

therapeuticGoalsRouter.use('*', authMiddleware(), requireRole(CLINICAL_ROLES), requireBodyOwnership());

/**
 * POST /api/goals
 * Cria nova meta terapêutica SMART (RFC-001 §3.4)
 */
therapeuticGoalsRouter.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json<CreateTherapeuticGoalDTO>();

    if (!body.patientId || !body.title || !body.description) {
      return c.json({ success: false, error: 'patientId, title e description são obrigatórios' }, 400);
    }

    const goal = await GoalService.createGoal(body, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, goal }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * GET /api/goals/patient/:patientId
 * Lista metas terapêuticas do paciente
 */
therapeuticGoalsRouter.get('/patient/:patientId', requirePatientAccess('patientId'), async (c) => {
  try {
    const patientId = c.req.param('patientId');
    const goals = GoalService.getPatientGoals(patientId);
    return c.json({ success: true, goals });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * PATCH /api/goals/:id
 * Atualiza status, progresso ou detalhes da meta
 */
therapeuticGoalsRouter.patch('/:id', requireOwnedResource((id) => db.therapeuticGoals.get(id), 'Meta'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json<UpdateTherapeuticGoalDTO>();

    const goal = GoalService.updateGoal(id, body, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json({ success: true, goal });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

/**
 * DELETE /api/goals/:id
 * Remove meta terapêutica
 */
therapeuticGoalsRouter.delete('/:id', requireOwnedResource((id) => db.therapeuticGoals.get(id), 'Meta'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');

    const result = GoalService.deleteGoal(id, {
      actorId: user.id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
      userAgent: c.req.header('user-agent')
    });

    return c.json(result);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});
