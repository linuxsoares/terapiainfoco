import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { app } from '../src/index';
import { globalRateLimitStore, InMemoryRateLimitStore, ResilientRateLimitStore, RedisRateLimitStore } from '../src/services/rateLimitStore';
import { rateLimiter, RATE_LIMIT_PRESETS } from '../src/middlewares/rateLimiter';
import { globalEncryptedCache } from '@terapiainfoco/crypto';
import { Hono } from 'hono';

describe('Rate Limiting Distribuído, Resiliência & Cache Criptográfico em Memória (RFC-001 Opção I)', () => {
  let adminToken: string;
  let secretáriaToken: string;

  beforeEach(async () => {
    // 1. Login como Admin
    const adminRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    const adminData = await adminRes.json();
    adminToken = adminData.accessToken;

    // 2. Login como Secretária
    const secRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recepcao@terapiainfoco.com.br', password: 'Senha@123456' })
    });
    const secData = await secRes.json();
    secretáriaToken = secData.accessToken;

    // Limpa estado global
    await globalRateLimitStore.reset();
    globalEncryptedCache.clear();
  });

  afterEach(async () => {
    await globalRateLimitStore.reset();
  });

  it('deve controlar requisições no InMemoryRateLimitStore e respeitar janela de tempo', async () => {
    const store = new InMemoryRateLimitStore(0);
    const key = 'test-ip:test-route';

    const r1 = await store.increment(key, 1000);
    expect(r1.count).toBe(1);

    const r2 = await store.increment(key, 1000);
    expect(r2.count).toBe(2);

    await store.reset(key);
    const r3 = await store.increment(key, 1000);
    expect(r3.count).toBe(1);

    store.destroy();
  });

  it('deve realizar fallback transparente no ResilientRateLimitStore quando o Redis falhar ou for forçado', async () => {
    const resilientStore = new ResilientRateLimitStore();

    // Com force fallback ativado, deve usar memória sem erros
    resilientStore.setForceMemoryFallback(true);

    const res = await resilientStore.increment('resilient:key', 5000);
    expect(res.count).toBe(1);

    const status = await resilientStore.getStatus();
    expect(status.storeType).toBe('memory');
    expect(status.connected).toBe(true);
    expect(status.totalKeys).toBeGreaterThanOrEqual(1);
  });

  it('deve anexar cabeçalhos X-RateLimit-* padronizados e X-RateLimit-Store no middleware Hono', async () => {
    const testApp = new Hono();
    const isolatedStore = new InMemoryRateLimitStore(0);

    testApp.get('/test-limit', rateLimiter({ windowMs: 60000, max: 3 }, isolatedStore), (c) => {
      return c.json({ ok: true });
    });

    // Req 1
    const res1 = await testApp.request('/test-limit');
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-RateLimit-Limit')).toBe('3');
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('2');
    expect(res1.headers.get('X-RateLimit-Store')).toBe('memory');

    // Req 2
    const res2 = await testApp.request('/test-limit');
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('1');

    // Req 3
    const res3 = await testApp.request('/test-limit');
    expect(res3.status).toBe(200);
    expect(res3.headers.get('X-RateLimit-Remaining')).toBe('0');

    // Req 4 (Deve ser bloqueada com HTTP 429 Too Many Requests e Retry-After)
    const res4 = await testApp.request('/test-limit');
    expect(res4.status).toBe(429);
    expect(res4.headers.get('Retry-After')).toBeDefined();
    const errData = await res4.json();
    expect(errData.success).toBe(false);
    expect(errData.limit).toBe(3);
    expect(errData.current).toBe(4);

    isolatedStore.destroy();
  });

  it('deve fornecer endpoint de diagnóstico GET /api/system/rate-limit/status para perfil Admin', async () => {
    const res = await app.request('/api/system/rate-limit/status', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.storeType).toBeDefined();
    expect(data.presets).toBeDefined();
    expect(data.presets.auth.max).toBe(RATE_LIMIT_PRESETS.auth.max);
    expect(data.presets.search.max).toBe(RATE_LIMIT_PRESETS.search.max);
    expect(data.presets.validation.max).toBe(RATE_LIMIT_PRESETS.validation.max);
    expect(data.presets.booking.max).toBe(RATE_LIMIT_PRESETS.booking.max);
  });

  it('deve permitir reset administrativo de rate limit via POST /api/system/rate-limit/reset', async () => {
    // Registra uma chave
    await globalRateLimitStore.increment('192.168.1.100:/api/auth/login', 60000);

    const res = await app.request('/api/system/rate-limit/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ key: '192.168.1.100:/api/auth/login' })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.targetKey).toBe('192.168.1.100:/api/auth/login');
  });

  it('deve fornecer telemetria do cache criptográfico em RAM e permitir rotação de DEK via API', async () => {
    // Insere dados de teste no cache
    globalEncryptedCache.set('session:temp', { userId: 'user-1' }, 10000);
    globalEncryptedCache.get('session:temp'); // 1 hit

    // 1. Consulta estatísticas
    const statsRes = await app.request('/api/system/cache/stats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json();
    expect(statsData.success).toBe(true);
    expect(statsData.encryptionAlgorithm).toBe('aes-256-gcm');
    expect(statsData.totalKeys).toBeGreaterThanOrEqual(1);
    expect(statsData.hits).toBeGreaterThanOrEqual(1);

    // 2. Rotação manual de chave em RAM
    const rotateRes = await app.request('/api/system/cache/rotate-key', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(rotateRes.status).toBe(200);
    const rotateData = await rotateRes.json();
    expect(rotateData.success).toBe(true);
    expect(rotateData.rotatedAt).toBeDefined();

    // Dado ainda acessível após rotação
    expect(globalEncryptedCache.get('session:temp')).toEqual({ userId: 'user-1' });
  });

  it('deve restringir acesso aos endpoints de sistema e rate limiting por RBAC', async () => {
    // Secretária tentando acessar status de rate limit -> 403 Forbidden
    const resSecStatus = await app.request('/api/system/rate-limit/status', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${secretáriaToken}` }
    });
    expect(resSecStatus.status).toBe(403);

    // Secretária tentando resetar rate limit -> 403 Forbidden
    const resSecReset = await app.request('/api/system/rate-limit/reset', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secretáriaToken}` },
      body: JSON.stringify({})
    });
    expect(resSecReset.status).toBe(403);

    // Secretária tentando rotacionar chave de cache -> 403 Forbidden
    const resSecCache = await app.request('/api/system/cache/rotate-key', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secretáriaToken}` }
    });
    expect(resSecCache.status).toBe(403);

    // Não-autenticado -> 401 Unauthorized
    const resAnon = await app.request('/api/system/rate-limit/status', {
      method: 'GET'
    });
    expect(resAnon.status).toBe(401);
  });
});
