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
    // Até trocar a senha inicial, o resto do sistema fica bloqueado
    expect((await app.request('/api/appointments/mine', { headers: { Authorization: `Bearer ${login.accessToken}` } })).status).toBe(403);

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

  // db.clear() preserva as contas: cada teste usa um e-mail próprio
  async function newReceptionist(adminToken: string, email: string) {
    const practice = (await (await app.request('/api/admin/practices', { headers: { Authorization: `Bearer ${adminToken}` } })).json() as any).practices[0];
    const created = await (await createMember(adminToken, {
      name: 'Rita Recepção', email, role: UserRole.RECEPCAO_SECRETARIA, therapistId: practice.therapistId
    })).json() as any;
    return created;
  }

  async function loginAs(email: string, password: string) {
    return app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  }

  it('senha inicial exige troca antes de usar o sistema', async () => {
    const admin = await tokenFor(UserRole.ADMIN);
    const created = await newReceptionist(admin.token, 'rita.inicial@clinica.com.br');
    expect(created.member.mustChangePassword).toBe(true);

    const session = await (await loginAs('rita.inicial@clinica.com.br', created.temporaryPassword)).json() as any;
    expect(session.user.mustChangePassword).toBe(true);
    const auth = { Authorization: `Bearer ${session.accessToken}` };
    const blocked = await app.request('/api/appointments/mine', { headers: auth });
    expect(blocked.status).toBe(403);
    expect((await blocked.json() as any).code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await app.request('/api/auth/me', { headers: auth })).status).toBe(200);

    const changed = await (await app.request('/api/auth/password', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: created.temporaryPassword, newPassword: 'MinhaSenha#2026' })
    })).json() as any;
    expect(changed.user.mustChangePassword).toBe(false);
    expect((await app.request('/api/appointments/mine', { headers: { Authorization: `Bearer ${changed.accessToken}` } })).status).toBe(200);
  });

  it('desativar bloqueia login e tokens já emitidos; reativar devolve o acesso', async () => {
    const admin = await tokenFor(UserRole.ADMIN);
    const created = await newReceptionist(admin.token, 'rita.desativar@clinica.com.br');
    const session = await (await loginAs('rita.desativar@clinica.com.br', created.temporaryPassword)).json() as any;
    const adminAuth = { Authorization: `Bearer ${admin.token}` };

    const disabled = await (await app.request(`/api/admin/users/${created.member.id}/disable`, { method: 'POST', headers: adminAuth })).json() as any;
    expect(disabled.member.disabled).toBe(true);
    expect((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${session.accessToken}` } })).status).toBe(401);
    expect((await loginAs('rita.desativar@clinica.com.br', created.temporaryPassword)).status).toBeGreaterThanOrEqual(400);

    await app.request(`/api/admin/users/${created.member.id}/enable`, { method: 'POST', headers: adminAuth });
    expect((await loginAs('rita.desativar@clinica.com.br', created.temporaryPassword)).status).toBe(200);
  });

  it('reemitir senha encerra sessões e só vale para contas da equipe', async () => {
    const admin = await tokenFor(UserRole.ADMIN);
    const created = await newReceptionist(admin.token, 'rita.reemitir@clinica.com.br');
    const session = await (await loginAs('rita.reemitir@clinica.com.br', created.temporaryPassword)).json() as any;
    await Bun.sleep(1100);
    const adminAuth = { Authorization: `Bearer ${admin.token}` };

    const reset = await (await app.request(`/api/admin/users/${created.member.id}/reset-password`, { method: 'POST', headers: adminAuth })).json() as any;
    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
    expect((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${session.accessToken}` } })).status).toBe(401);
    expect((await loginAs('rita.reemitir@clinica.com.br', created.temporaryPassword)).status).toBe(401);
    expect((await loginAs('rita.reemitir@clinica.com.br', reset.temporaryPassword)).status).toBe(200);
    expect(db.auditLogs.some((l) => l.action === AuditAction.USER_PASSWORD_RESET && l.actorId === admin.userId)).toBe(true);

    // Psicólogo titular e Admin não são geridos por aqui
    const psychologist = Array.from(db.users.values()).find((u) => u.role === UserRole.PSICOLOGO_TITULAR)!;
    expect((await app.request(`/api/admin/users/${psychologist.id}/disable`, { method: 'POST', headers: adminAuth })).status).toBe(404);
    expect((await app.request(`/api/admin/users/${admin.userId}/reset-password`, { method: 'POST', headers: adminAuth })).status).toBe(404);
  });
});
