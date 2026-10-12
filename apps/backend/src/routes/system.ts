import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { UserRole, type RateLimitStatusResponse, type ResetRateLimitResponse, type EncryptedCacheStatsResponse, type RotateCacheKeyResponse } from '@terapiainfoco/shared';
import { globalRateLimitStore, RATE_LIMIT_PRESETS, resetRateLimit } from '../middlewares/rateLimiter';
import { globalEncryptedCache } from '@terapiainfoco/crypto';
import { auditService } from '../services/auditService';
import { HealthService } from '../services/healthService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';

export const systemRoute = new Hono();

// Acesso a diagnóstico e controle de infraestrutura é restrito a perfil Administrador
systemRoute.use('*', authMiddleware({ strict: true }));
systemRoute.use('*', requireRoles([UserRole.ADMIN]));

/**
 * 1. Status do Rate Limiting Distribuído (Redis / In-Memory Fallback)
 */
systemRoute.get('/rate-limit/status', async (c) => {
  const storeStatus = await globalRateLimitStore.getStatus();

  const response: RateLimitStatusResponse = {
    success: true,
    storeType: storeStatus.storeType,
    redisConnected: storeStatus.connected,
    redisHost: storeStatus.host,
    totalTrackedKeys: storeStatus.totalKeys,
    presets: RATE_LIMIT_PRESETS,
    activeBlocksCount: storeStatus.totalKeys
  };

  return c.json(response, 200);
});

/**
 * 2. Reset Administrativo de Rate Limit (Desbloqueio de IP ou Rota)
 */
systemRoute.post('/rate-limit/reset', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { key?: string };
  const key = body.key?.trim();

  await resetRateLimit(key);

  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: key || 'ALL_KEYS',
    action: AuditAction.UPDATE,
    ipAddress: ip,
    userAgent: `Rate limit administratively reset: ${key || 'ALL_KEYS'}`
  }).catch(() => {});

  const response: ResetRateLimitResponse = {
    success: true,
    message: key ? `Rate limit para a chave '${key}' resetado com sucesso.` : 'Todos os limites de taxa foram reiniciados.',
    targetKey: key || 'ALL'
  };

  return c.json(response, 200);
});

/**
 * 3. Estatísticas do Cache Criptográfico em Memória (AES-256-GCM)
 */
systemRoute.get('/cache/stats', (c) => {
  const stats = globalEncryptedCache.getStats();

  const response: EncryptedCacheStatsResponse = {
    success: true,
    totalKeys: stats.totalKeys,
    hits: stats.hits,
    misses: stats.misses,
    hitRatio: stats.hitRatio,
    encryptionAlgorithm: 'aes-256-gcm',
    keyRotationAgeSeconds: stats.keyRotationAgeSeconds,
    itemsInMemoryEncrypted: stats.itemsInMemoryEncrypted,
    memorySizeBytesEstimate: stats.memorySizeBytesEstimate
  };

  return c.json(response, 200);
});

/**
 * 4. Rotação Manual da Chave de Cifra (DEK) em RAM do Cache
 */
systemRoute.post('/cache/rotate-key', (c) => {
  globalEncryptedCache.rotateKey();

  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: 'RAM_ENCRYPTED_CACHE_DEK',
    action: AuditAction.UPDATE,
    ipAddress: ip,
    userAgent: 'Manual DEK rotation executed for in-memory encrypted cache'
  }).catch(() => {});

  const response: RotateCacheKeyResponse = {
    success: true,
    message: 'Chave DEK do cache em memória rotacionada e re-cifrada com sucesso.',
    rotatedAt: new Date().toISOString()
  };

  return c.json(response, 200);
});

/**
 * 5. Purge de Entradas Expiradas do Cache Criptográfico
 */
systemRoute.post('/cache/purge-expired', (c) => {
  const purgedCount = globalEncryptedCache.purgeExpired();
  return c.json({ success: true, purgedCount }, 200);
});

/**
 * 6. Painel de Probes e Observabilidade de Infraestrutura (RFC §5.2)
 */
systemRoute.get('/probes/readiness', async (c) => {
  const readiness = await HealthService.checkReadiness();
  return c.json(readiness, 200);
});

systemRoute.get('/probes/liveness', (c) => {
  const liveness = HealthService.checkLiveness();
  return c.json(liveness, 200);
});

systemRoute.get('/probes/startup', (c) => {
  const startup = HealthService.checkStartup();
  return c.json(startup, 200);
});

