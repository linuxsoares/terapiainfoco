import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { setEmailSenderForTests, type EmailMessage } from '../src/services/email/emailSender';
import { resetDb } from './helpers/db';

const json = { 'Content-Type': 'application/json' };

describe('Confirmação de e-mail no cadastro', () => {
  let outbox: EmailMessage[];

  beforeEach(async () => {
    await resetDb();
    await globalRateLimitStore.reset();
    outbox = [];
    setEmailSenderForTests({ name: 'test', send: async (m) => { outbox.push(m); } });
  });

  afterEach(() => setEmailSenderForTests(undefined));

  const post = (path: string, body: unknown, headers: Record<string, string> = json) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const tokenFrom = (m: EmailMessage) => decodeURIComponent(m.text.match(/verificar-email=([A-Za-z0-9_-]+)/)![1]);

  const register = async (email: string) => {
    const res = await post('/api/auth/register', { name: 'Paula Nova', email, password: 'SenhaForte@2026', role: 'PACIENTE' });
    expect(res.status).toBe(201);
    return (await res.json() as any).user;
  };

  it('cadastro envia o link; confirmar marca a conta como verificada', async () => {
    const user = await register('paula.nova@exemplo.com');
    expect(user.emailVerified).toBe(false);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('paula.nova@exemplo.com');

    const res = await post('/api/auth/email/verify', { token: tokenFrom(outbox[0]) });
    expect(res.status).toBe(200);
    expect((await res.json() as any).user.emailVerified).toBe(true);

    // Uso único
    expect((await post('/api/auth/email/verify', { token: tokenFrom(outbox[0]) })).status).toBe(400);
  });

  it('reenvio invalida o link anterior; conta confirmada não recebe novo e-mail', async () => {
    await register('reenvio@exemplo.com');
    const login = await (await post('/api/auth/login', { email: 'reenvio@exemplo.com', password: 'SenhaForte@2026' })).json() as any;
    const auth = { ...json, Authorization: `Bearer ${login.accessToken}` };

    expect((await post('/api/auth/email/resend', {}, auth)).status).toBe(202);
    expect(outbox).toHaveLength(2);
    expect((await post('/api/auth/email/verify', { token: tokenFrom(outbox[0]) })).status).toBe(400);
    expect((await post('/api/auth/email/verify', { token: tokenFrom(outbox[1]) })).status).toBe(200);

    expect((await post('/api/auth/email/resend', {}, auth)).status).toBe(202);
    expect(outbox).toHaveLength(2);
    const me = await (await app.request('/api/auth/me', { headers: auth })).json() as any;
    expect(me.user.emailVerified).toBe(true);
  });

  it('token de recuperação de senha não confirma e-mail', async () => {
    await post('/api/auth/password/forgot', { email: 'psicologo@terapiainfoco.com.br' });
    const resetToken = decodeURIComponent(outbox[0].text.match(/redefinir-senha=([A-Za-z0-9_-]+)/)![1]);
    expect((await post('/api/auth/email/verify', { token: resetToken })).status).toBe(400);
  });

  it('reenvio exige sessão', async () => {
    expect((await post('/api/auth/email/resend', {})).status).toBe(401);
  });
});
