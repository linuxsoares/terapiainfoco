import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { config } from '../src/config';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { resetDb, seedDemoSession } from './helpers/db';

/**
 * Supabase Auth não é fonte de identidade: uma conta criada lá (com o e-mail de outra pessoa ou
 * com role em user_metadata) não pode entrar no sistema.
 */
describe('Sem fallback de autenticação pelo Supabase', () => {
  const originalFetch = globalThis.fetch;
  const originalSupabase = { ...config.supabase };
  let supabaseCalls = 0;

  beforeEach(async () => {
    await resetDb();
    await seedDemoSession();
    await globalRateLimitStore.reset();
    supabaseCalls = 0;
    config.supabase.url = 'https://projeto.supabase.co';
    config.supabase.publishableKey = 'chave-publica';
    // Supabase "aceitaria" qualquer credencial e devolveria um usuário que se declara ADMIN
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).includes('supabase.co')) {
        supabaseCalls++;
        return new Response(JSON.stringify({
          id: 'sb-user',
          email: 'admin@terapiainfoco.com.br',
          user: { id: 'sb-user', email: 'admin@terapiainfoco.com.br', user_metadata: { role: 'ADMIN' } },
          user_metadata: { role: 'ADMIN' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.assign(config.supabase, originalSupabase);
  });

  it('senha errada para um e-mail existente não é validada no Supabase', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@terapiainfoco.com.br', password: 'senha-do-atacante' })
    });
    expect(res.status).toBe(401);
    expect(supabaseCalls).toBe(0);
  });

  it('token que não foi emitido pela API é rejeitado', async () => {
    const res = await app.request('/api/auth/me', { headers: { Authorization: 'Bearer token-do-supabase' } });
    expect(res.status).toBe(401);
    expect(supabaseCalls).toBe(0);
  });
});
