import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { 
  UserRole, 
  type RateLimitStatusResponse, 
  type ResetRateLimitResponse, 
  type EncryptedCacheStatsResponse, 
  type RotateCacheKeyResponse,
  type RunSyntheticProbeRequestDTO,
  type SyntheticHistoryResponse
} from '@terapiainfoco/shared';
import { globalRateLimitStore, RATE_LIMIT_PRESETS, resetRateLimit } from '../middlewares/rateLimiter';
import { globalEncryptedCache } from '@terapiainfoco/crypto';
import { auditService } from '../services/auditService';
import { HealthService } from '../services/healthService';
import { SyntheticService } from '../services/syntheticService';
import { TelemetryService } from '../telemetry/telemetryService';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';


export const systemRoute = new Hono();

// Acesso a diagnóstico e controle de infraestrutura é restrito a perfil Administrador
systemRoute.use('*', authMiddleware(), requireRoles([UserRole.ADMIN]));

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

/**
 * 7. Monitoramento Sintético & Testes E2E da Jornada Clínica (Opção M - RFC-001)
 */
systemRoute.post('/synthetic/run', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as RunSyntheticProbeRequestDTO;
  const result = await SyntheticService.runProbe(body, 'manual');

  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  auditService.logAccess({
    actorId: actor?.id || 'admin-system',
    resourceType: AuditResourceType.SECURITY,
    resourceId: result.executionId,
    action: AuditAction.GENERATE_REPORT,
    ipAddress: ip,
    userAgent: `Synthetic clinical probe executed: status=${result.status}, steps=${result.summary.passed}/${result.summary.total}`
  }).catch(() => {});

  return c.json(result, 200);
});

systemRoute.get('/synthetic/history', (c) => {
  const history = SyntheticService.getHistory();
  const response: SyntheticHistoryResponse = {
    success: true,
    count: history.length,
    executions: history
  };
  return c.json(response, 200);
});

systemRoute.get('/synthetic/resilience', async (c) => {
  const result = await SyntheticService.checkResilience();
  return c.json(result, 200);
});

/**
 * 8. Telemetria OpenTelemetry & Métricas RED / Prometheus (Opção N - RFC-001 §5.2)
 */
systemRoute.get('/telemetry/overview', (c) => {
  const overview = TelemetryService.getOverview();
  return c.json({
    success: true,
    telemetry: overview
  }, 200);
});

systemRoute.get('/telemetry/traces', (c) => {
  const limit = Math.min(100, Number(c.req.query('limit')) || 50);
  const traces = TelemetryService.getTraces(limit);
  return c.json({
    success: true,
    count: traces.length,
    traces
  }, 200);
});

systemRoute.get('/telemetry/metrics-raw', (c) => {
  const metrics = TelemetryService.getPrometheusMetricsText();
  return c.json({
    success: true,
    format: 'prometheus_text',
    metrics
  }, 200);
});

/**
 * Endpoints de Exportação Automática OTLP (RFC-001 §5.2 - Opção N)
 */
systemRoute.get('/telemetry/otlp/status', (c) => {
  const status = TelemetryService.getOtlpStatus();
  return c.json({
    success: true,
    config: status.config,
    stats: status.stats
  }, 200);
});

systemRoute.put('/telemetry/otlp/config', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const updated = TelemetryService.updateOtlpConfig(body, actor?.id || 'admin-system', ip);
    return c.json({
      success: true,
      config: updated,
      message: 'Configuração do exportador OTLP atualizada com sucesso.'
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      error: err?.message || 'Falha ao atualizar configuração OTLP.'
    }, 400);
  }
});

systemRoute.post('/telemetry/otlp/flush', async (c) => {
  const result = await TelemetryService.flushOtlp();
  const status = TelemetryService.getOtlpStatus();

  return c.json({
    success: result.success,
    result,
    stats: status.stats
  }, result.success ? 200 : 502);
});

systemRoute.post('/telemetry/otlp/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await TelemetryService.testOtlpConnection(body);

  return c.json({
    success: result.success,
    result
  }, result.success ? 200 : 502);
});


/**
 * 9. Testes de Carga, Stress Concorrente & Avaliação de SLOs RED (RFC §5.1, §5.2)
 */
import { stressTestService } from '../services/stressTestService';
import type { RunStressTestDTO } from '@terapiainfoco/shared';

systemRoute.post('/stress/run', async (c) => {
  const body = await c.req.json<RunStressTestDTO>().catch(() => ({}));
  const actor = (c as any).user;
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';

  try {
    const report = await stressTestService.runStressTest(body, actor?.id || 'admin-system', ip);
    return c.json({
      success: true,
      report,
      message: `Teste de stress concluído: ${report.rps} RPS com P99 de ${report.percentiles.p99}ms. (${report.slosPassedCount}/${report.slosTotalCount} SLOs cumpridos).`
    }, 200);
  } catch (err: any) {
    return c.json({
      success: false,
      error: err.message || 'Erro durante a execução do teste de stress'
    }, 500);
  }
});

systemRoute.get('/stress/history', (c) => {
  const reports = stressTestService.getHistory();
  return c.json({
    success: true,
    reports
  }, 200);
});

systemRoute.get('/stress/slos', (c) => {
  const slos = stressTestService.getSlosDefinition();
  return c.json({
    success: true,
    slos
  }, 200);
});

