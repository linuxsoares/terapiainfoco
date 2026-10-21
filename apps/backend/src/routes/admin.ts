import { Hono, type Context } from 'hono';
import {
  UserRole,
  type CreateStaffMemberDTO,
  type CreateStaffMemberResponse,
  type ResetStaffPasswordResponse
} from '@terapiainfoco/shared';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { TeamService, TeamInputError } from '../services/teamService';

export const adminRoute = new Hono();

// Gestão da plataforma: exclusiva do Admin
adminRoute.use('*', authMiddleware({ strict: true }), requireRoles([UserRole.ADMIN]));

// Consultórios disponíveis para vincular contas da equipe
adminRoute.get('/practices', async (c) => c.json({ success: true, practices: await TeamService.listPractices() }));

// Equipe e administradores (contas que não são de paciente)
adminRoute.get('/users', async (c) => c.json({ success: true, members: await TeamService.listStaff() }));

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

const adminContext = (c: Context) => ({
  actorId: c.get('user').id,
  ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1'
});

// Desativa / reativa conta da equipe
for (const [path, disabled] of [['disable', true], ['enable', false]] as const) {
  adminRoute.post(`/users/:id/${path}`, async (c) => {
    try {
      const member = await TeamService.setDisabled(c.req.param('id'), disabled, adminContext(c));
      return c.json({ success: true, member });
    } catch (err: any) {
      if (err instanceof TeamInputError) return c.json({ success: false, error: err.message }, 404);
      throw err;
    }
  });
}

// Reemite a senha inicial (exibida uma vez)
adminRoute.post('/users/:id/reset-password', async (c) => {
  try {
    const { member, temporaryPassword } = await TeamService.resetPassword(c.req.param('id'), adminContext(c));
    const response: ResetStaffPasswordResponse = { success: true, member, temporaryPassword };
    return c.json(response);
  } catch (err: any) {
    if (err instanceof TeamInputError) return c.json({ success: false, error: err.message }, 404);
    throw err;
  }
});
