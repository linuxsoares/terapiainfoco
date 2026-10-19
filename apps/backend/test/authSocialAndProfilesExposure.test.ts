import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { config } from '../src/config';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole, SocialAuthProvider } from '@terapiainfoco/shared';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000004';
const PACIENTE_EMAIL = 'paciente@terapiainfoco.com.br';

async function tokenFor(email: string): Promise<string> {
  const user = Array.from(db.users.values()).find((u) => u.email === email)!;
  const { accessToken } = await authService.issueTokens(user, '127.0.0.1');
  return accessToken;
}

function socialLogin(email: string) {
  return app.request('/api/auth/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: SocialAuthProvider.GOOGLE, email, name: 'Qualquer' })
  });
}

describe('Login social e listagem de perfis', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  afterEach(() => {
    config.demoMode = true;
  });

  it('fora de DEMO_MODE o login social não emite tokens só com o e-mail de uma conta existente', async () => {
    config.demoMode = false;
    const admin = db.users.get(ADMIN_ID)!;
    const res = await socialLogin(admin.email);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.accessToken).toBeUndefined();
  });

  it('GET /api/auth/profiles exige autenticação', async () => {
    expect((await app.request('/api/auth/profiles')).status).toBe(401);
  });

  it('GET /api/auth/profiles é restrito ao Admin/DPO', async () => {
    const psicologa = db.users.get(PSICOLOGA_ID)!;
    const asPsicologa = await app.request('/api/auth/profiles', {
      headers: { Authorization: `Bearer ${await tokenFor(psicologa.email)}` }
    });
    expect(asPsicologa.status).toBe(403);

    const asAdmin = await app.request('/api/auth/profiles', {
      headers: { Authorization: `Bearer ${await tokenFor(db.users.get(ADMIN_ID)!.email)}` }
    });
    expect(asAdmin.status).toBe(200);
    expect((await asAdmin.json()).profiles.length).toBeGreaterThan(0);
  });

  it('paciente não declara CRP nem campos de outro papel ao editar o perfil', async () => {
    const res = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(PACIENTE_EMAIL)}` },
      body: JSON.stringify({ crp: '06/999999', specialty: 'Falsa', department: 'TI', emergencyContactName: 'Ana' })
    });
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.role).toBe(UserRole.PACIENTE);
    expect(user.crp).toBeUndefined();
    expect(user.specialty).toBeUndefined();
    expect(user.department).toBeUndefined();
    expect(user.emergencyContactName).toBe('Ana');
  });
});
