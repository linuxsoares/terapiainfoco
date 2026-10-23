import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { setEmailSenderForTests, type EmailMessage } from '../src/services/email/emailSender';
import { AuthTokenRepository } from '../src/repositories/authTokenRepository';
import { resetDb } from './helpers/db';

const EMAIL = 'psicologo@terapiainfoco.com.br';
const json = { 'Content-Type': 'application/json' };

describe('Recuperação de senha por e-mail', () => {
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

  const requestLink = async (): Promise<string> => {
    const res = await post('/api/auth/password/forgot', { email: EMAIL });
    expect(res.status).toBe(202);
    const match = outbox.at(-1)!.text.match(/redefinir-senha=([A-Za-z0-9_-]+)/);
    return decodeURIComponent(match![1]);
  };

  it('envia link de uso único e troca a senha, encerrando as sessões antigas', async () => {
    const login = await (await post('/api/auth/login', { email: EMAIL, password: 'Senha@123456' })).json() as any;
    const token = await requestLink();
    expect(outbox[0].to).toBe(EMAIL);
    expect(outbox[0].subject).toContain('Redefinição de senha');

    const reset = await post('/api/auth/password/reset', { token, newPassword: 'NovaSenha@2026' });
    expect(reset.status).toBe(200);

    expect((await post('/api/auth/login', { email: EMAIL, password: 'Senha@123456' })).status).not.toBe(200);
    expect((await post('/api/auth/login', { email: EMAIL, password: 'NovaSenha@2026' })).status).toBe(200);
    const me = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${login.accessToken}` } });
    expect(me.status).toBe(401);

    // Uso único
    expect((await post('/api/auth/password/reset', { token, newPassword: 'OutraSenha@2026' })).status).toBe(400);
  });

  it('resposta igual para e-mail inexistente, sem enviar nada', async () => {
    const res = await post('/api/auth/password/forgot', { email: 'ninguem@exemplo.com' });
    expect(res.status).toBe(202);
    expect(outbox).toHaveLength(0);
  });

  it('novo pedido invalida o link anterior; link expirado é recusado', async () => {
    const first = await requestLink();
    const second = await requestLink();
    expect((await post('/api/auth/password/reset', { token: first, newPassword: 'NovaSenha@2026' })).status).toBe(400);

    const stored = await AuthTokenRepository.findByHash(new Bun.CryptoHasher('sha256').update(second).digest('hex'));
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).not.toBe(second); // só o hash é persistido
    const db: any = await (await import('../src/db')).getDb();
    const { schema } = await import('../src/db');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authTokens.id, stored!.id));
    expect((await post('/api/auth/password/reset', { token: second, newPassword: 'NovaSenha@2026' })).status).toBe(400);
  });

  it('valida senha curta e token ausente', async () => {
    const token = await requestLink();
    expect((await post('/api/auth/password/reset', { token, newPassword: 'curta' })).status).toBe(400);
    expect((await post('/api/auth/password/reset', { newPassword: 'NovaSenha@2026' })).status).toBe(400);
    // Senha curta não consome o link
    expect((await post('/api/auth/password/reset', { token, newPassword: 'NovaSenha@2026' })).status).toBe(200);
  });
});
