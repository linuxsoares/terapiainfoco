import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditAction } from '@terapiainfoco/shared';
import { resetDb } from './helpers/db';

const EMAIL = 'recepcao@terapiainfoco.com.br';
const PASSWORD = 'Senha@123456';

async function login(password: string) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password })
  });
}

async function changePassword(accessToken: string, body: object) {
  return app.request('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body)
  });
}

describe('Troca da própria senha', () => {
  beforeEach(async () => {
    await resetDb();
    db.seedDemoSession();
    await globalRateLimitStore.reset();
  });

  it('exige a senha atual e uma nova senha válida', async () => {
    const { accessToken } = await (await login(PASSWORD)).json() as any;
    expect((await changePassword(accessToken, { currentPassword: 'errada', newPassword: 'NovaSenha#2026' })).status).toBe(400);
    expect((await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: 'curta' })).status).toBe(400);
    expect((await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
    expect((await changePassword(accessToken, { newPassword: 'NovaSenha#2026' })).status).toBe(400);
  });

  it('troca a senha, mantém a sessão atual e encerra as sessões anteriores', async () => {
    const other = await (await login(PASSWORD)).json() as any;
    // iat tem precisão de segundos: a sessão "antiga" precisa ser de um segundo anterior
    await Bun.sleep(1100);
    const current = await (await login(PASSWORD)).json() as any;

    const res = await changePassword(current.accessToken, { currentPassword: PASSWORD, newPassword: 'NovaSenha#2026' });
    expect(res.status).toBe(200);
    const fresh = await res.json() as any;
    expect(fresh.accessToken).toBeDefined();

    // Tokens novos funcionam; os emitidos antes da troca, não
    expect((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${fresh.accessToken}` } })).status).toBe(200);
    expect((await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${other.accessToken}` } })).status).toBe(401);
    const refresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: other.refreshToken })
    });
    expect(refresh.status).toBeGreaterThanOrEqual(400);

    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login('NovaSenha#2026')).status).toBe(200);
    expect(db.auditLogs.some((l) => l.action === AuditAction.AUTH_PASSWORD_CHANGED)).toBe(true);
  });
});
