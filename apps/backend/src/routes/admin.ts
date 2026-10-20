import { Hono } from 'hono';
import { UserRole, type CreateStaffMemberDTO, type CreateStaffMemberResponse } from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { TeamService, TeamInputError } from '../services/teamService';

export const adminRoute = new Hono();

// Gestão da plataforma: exclusiva do Admin
adminRoute.use('*', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]));

// Consultórios disponíveis para vincular contas da equipe
adminRoute.get('/practices', (c) => c.json({ success: true, practices: TeamService.listPractices() }));

// Equipe e administradores (contas que não são de paciente)
adminRoute.get('/users', (c) => c.json({ success: true, members: TeamService.listStaff() }));

// Cria conta de Recepção ou Supervisor vinculada a um consultório
adminRoute.post('/users', async (c) => {
  const body = await c.req.json<CreateStaffMemberDTO>().catch(() => null);
  if (!body) return c.json({ success: false, error: 'Corpo da requisição inválido.' }, 400);
  try {
    const { member, temporaryPassword } = await TeamService.createStaffMember(body, {
      actorId: c.get('user').id,
      ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1'
    });
    const response: CreateStaffMemberResponse = { success: true, member, temporaryPassword };
    return c.json(response, 201);
  } catch (err: any) {
    if (err instanceof TeamInputError) return c.json({ success: false, error: err.message }, 400);
    throw err;
  }
});
