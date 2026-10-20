import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditAction, AuditResourceType, UserRole } from '@terapiainfoco/shared';

async function tokenFor(role: UserRole): Promise<{ token: string; userId: string }> {
  const user = Array.from(db.users.values()).find((u) => u.role === role)!;
  const { accessToken } = await authService.issueTokens(user, '127.0.0.1');
  return { token: accessToken!, userId: user.id };
}

async function createMember(token: string, body: object) {
  return app.request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

describe('Gestão de equipe pelo Admin', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('cria Recepção vinculada ao consultório, com senha inicial que permite entrar', async () => {
    const admin = await tokenFor(UserRole.ADMIN);
    const practices = await (await app.request('/api/admin/practices', { headers: { Authorization: `Bearer ${admin.token}` } })).json() as any;
    expect(practices.practices.length).toBeGreaterThan(0);
    const practice = practices.practices[0];

    const res = await createMember(admin.token, {
      name: 'Joana Recepção', email: 'joana@clinica.com.br', role: UserRole.RECEPCAO_SECRETARIA, therapistId: practice.therapistId
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.member.therapistId).toBe(practice.therapistId);
    expect(body.member.practiceName).toBe(practice.name);
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // Auditoria em nome do Admin
    expect(db.auditLogs.some((l) =>
      l.action === AuditAction.CREATE && l.resourceType === AuditResourceType.USER &&
      l.resourceId === body.member.id && l.actorId === admin.userId
    )).toBe(true);

    // A nova conta entra e enxerga a agenda do consultório
    const login = await (await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'joana@clinica.com.br', password: body.temporaryPassword })
    })).json() as any;
    expect(login.user.therapistId).toBe(practice.therapistId);
    expect((await app.request('/api/appointments/mine', { headers: { Authorization: `Bearer ${login.accessToken}` } })).status).toBe(200);

    const list = await (await app.request('/api/admin/users', { headers: { Authorization: `Bearer ${admin.token}` } })).json() as any;
    expect(list.members.some((m: any) => m.email === 'joana@clinica.com.br')).toBe(true);
    expect(list.members.every((m: any) => m.role !== UserRole.PACIENTE)).toBe(true);
  });

  it('rejeita perfil fora da equipe, consultório inexistente e e-mail repetido', async () => {
    const admin = await tokenFor(UserRole.ADMIN);
    const practice = (await (await app.request('/api/admin/practices', { headers: { Authorization: `Bearer ${admin.token}` } })).json() as any).practices[0];
    const base = { name: 'Fulano', email: 'fulano@clinica.com.br', therapistId: practice.therapistId };

    expect((await createMember(admin.token, { ...base, role: UserRole.ADMIN })).status).toBe(400);
    expect((await createMember(admin.token, { ...base, role: UserRole.PSICOLOGO_TITULAR })).status).toBe(400);
    expect((await createMember(admin.token, { ...base, role: UserRole.SUPERVISOR_CLINICO, therapistId: 'inexistente' })).status).toBe(400);
    expect((await createMember(admin.token, { ...base, role: UserRole.SUPERVISOR_CLINICO, email: 'invalido' })).status).toBe(400);
    expect((await createMember(admin.token, { ...base, role: UserRole.SUPERVISOR_CLINICO })).status).toBe(201);
    expect((await createMember(admin.token, { ...base, role: UserRole.SUPERVISOR_CLINICO })).status).toBe(400);
  });

  it('é exclusiva do Admin', async () => {
    for (const role of [UserRole.PSICOLOGO_TITULAR, UserRole.RECEPCAO_SECRETARIA, UserRole.SUPERVISOR_CLINICO, UserRole.PACIENTE]) {
      const { token } = await tokenFor(role);
      expect((await app.request('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403);
      expect((await createMember(token, { name: 'X', email: 'x@x.com', role: UserRole.RECEPCAO_SECRETARIA, therapistId: 'x' })).status).toBe(403);
    }
    expect((await app.request('/api/admin/users')).status).toBe(401);
  });
});
