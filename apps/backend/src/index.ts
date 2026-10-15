import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config';
import { patientsRoute } from './routes/patients';
import { appointmentsRoute } from './routes/appointments';
import { clinicalRecordsRoute } from './routes/clinicalRecords';
import { auditRoute } from './routes/audit';
import { documentsRoute } from './routes/documents';
import { transcriptionsRoute } from './routes/transcriptions';
import { authRoute } from './routes/auth';
import { analyticsRoute } from './routes/analytics';
import { backupsRoute } from './routes/backups';
import { systemRoute } from './routes/system';
import { webhookRoute } from './routes/webhooks';
import { siemRoute } from './routes/siem';
import { kmsRoute } from './routes/kms';
import { securityHardeningRoute } from './routes/securityHardening';
import { webrtcSecurityRoute } from './routes/webrtcSecurity';
import { wafRoute } from './routes/waf';
import { networkResilienceRoute } from './routes/networkResilience';
import { mediaShardingRoute } from './routes/mediaSharding';
import { sessionRecoveryRoute } from './routes/sessionRecovery';
import { zkpRoute } from './routes/zkp';
import { threatIntelligenceRoute } from './routes/threatIntelligence';
import { consentRoutes } from './routes/consent';
import { dlpRoutes } from './routes/dlp';
import { clinicalNotaryRoutes } from './routes/clinicalNotary';
import { securePurgeRoutes } from './routes/securePurge';
import { didRouter } from './routes/clinicalDid';
import { uebaRouter } from './routes/ueba';
import { dpRouter } from './routes/differentialPrivacy';
import { sessionBindingRoute } from './routes/sessionBinding';
import { bruteForcePowRoute } from './routes/bruteForcePow';
import { antiAutomationTarpitRoute } from './routes/antiAutomationTarpit';
import { clinicalSessionTsaRoutes } from './routes/clinicalSessionTsa';
import { httpGuardRoutes } from './routes/httpGuard';
import { homomorphicRoutes } from './routes/homomorphic';
import { ssrfGuardRoutes } from './routes/ssrfGuard';
import { advancedRateLimiterRoutes } from './routes/advancedRateLimiter';
import { securityHeadersMiddleware } from './middlewares/securityHeadersMiddleware';
import { honeypotMiddleware } from './middlewares/honeypotMiddleware';
import { wafMiddleware } from './middlewares/wafMiddleware';
import { getDb } from './db';

export const app = new Hono();

// Inicialização de banco de dados e migrações Drizzle no boot
try {
  await getDb();
  console.log('✅ Banco de dados conectado e migrações aplicadas com sucesso no boot.');
} catch (err) {
  console.error('⚠️ Erro ao inicializar banco de dados no boot:', err);
}




// Middlewares globais
import { telemetryMiddleware } from './telemetry/telemetryMiddleware';
import { TelemetryService } from './telemetry/telemetryService';

app.use('*', telemetryMiddleware());
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'traceparent', 'tracestate']
}));
app.use('*', securityHeadersMiddleware());
app.use('*', honeypotMiddleware());
app.use('*', wafMiddleware());


// Prometheus Metrics Exporter (RFC-001 §5.2 / OpenMetrics Standard)
app.get('/metrics', (c) => {
  const metrics = TelemetryService.getPrometheusMetricsText();
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
  });
});

// Importação do serviço de observabilidade e probes de saúde (RFC §5.2)
import { HealthService } from './services/healthService';

// Health Check & Liveness Probe (12-Factor App & Kubernetes/Railway)
app.get('/health', (c) => {
  const liveness = HealthService.checkLiveness();
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL || '';
  const isPostgres = !!dbUrl;
  const isSupabaseDb = dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com');

  return c.json({
    status: 'ok',
    livenessStatus: liveness.status,
    service: liveness.service,
    version: liveness.version,
    rfc: 'RFC-001',
    uptimeSeconds: liveness.system.uptimeSeconds,
    uptimeFormatted: liveness.system.uptimeFormatted,
    memoryRssMb: liveness.system.memory.rssMb,
    memoryHeapUsedMb: liveness.system.memory.heapUsedMb,
    database: {
      driver: isPostgres ? 'postgresql' : 'pglite_fallback',
      databaseUrlConfigured: isPostgres,
      supabaseDatabaseConnected: isSupabaseDb,
      supabaseUrlConfigured: !!process.env.SUPABASE_URL,
      supabaseAuthAdminEnabled: !!(config.supabase.url && config.supabase.secretKey)
    },
    compliance: {
      cfp: ['001/2009', '011/2018', '006/2019', '004/2020'],
      lgpd: ['Art. 5 II', 'Art. 11', 'Art. 16', 'Art. 48']
    },
    timestamp: liveness.timestamp
  });
});

app.get('/health/liveness', (c) => {
  const liveness = HealthService.checkLiveness();
  return c.json(liveness, 200);
});

// Readiness Probe (Avaliação Ativa Multi-Dependências: DB, KMS, Cache, RateLimiter, WORM)
app.get('/health/readiness', async (c) => {
  const readiness = await HealthService.checkReadiness();
  const statusCode = readiness.status === 'unhealthy' ? 503 : 200;
  return c.json(readiness, statusCode);
});

// Startup Probe (Verificação de Migrações e Inicialização Inicial de Banco)
app.get('/health/startup', (c) => {
  const startup = HealthService.checkStartup();
  const statusCode = startup.status === 'unhealthy' ? 503 : 200;
  return c.json(startup, statusCode);
});


// Rotas de domínios RFC-001
app.route('/api/auth', authRoute);
app.route('/api/patients', patientsRoute);
app.route('/api/appointments', appointmentsRoute);
app.route('/api/clinical-records', clinicalRecordsRoute);
app.route('/api/documents', documentsRoute);
app.route('/api/transcriptions', transcriptionsRoute);
app.route('/api/audit', auditRoute);
app.route('/api/analytics', analyticsRoute);
app.route('/api/backups', backupsRoute);
app.route('/api/system', systemRoute);
app.route('/api/webhooks', webhookRoute);
app.route('/api/siem', siemRoute);
app.route('/api/kms', kmsRoute);
app.route('/api/security/hardening', securityHardeningRoute);
app.route('/api/teleconsultation/webrtc', webrtcSecurityRoute);
app.route('/api/security/waf', wafRoute);
app.route('/api/teleconsultation/network-resilience', networkResilienceRoute);
app.route('/api/teleconsultation/media', mediaShardingRoute);
app.route('/api/teleconsultation/session-recovery', sessionRecoveryRoute);
app.route('/api/security/zkp', zkpRoute);
app.route('/api/security/threat-intelligence', threatIntelligenceRoute);
app.route('/api/consent', consentRoutes);
app.route('/api/dlp', dlpRoutes);
app.route('/api/notary', clinicalNotaryRoutes);
app.route('/api/purge', securePurgeRoutes);
app.route('/api/did', didRouter);
app.route('/api/ueba', uebaRouter);
app.route('/api/differential-privacy', dpRouter);
app.route('/api/session-binding', sessionBindingRoute);
app.route('/api/brute-force-pow', bruteForcePowRoute);
app.route('/api/anti-automation', antiAutomationTarpitRoute);
app.route('/api/tsa-notary', clinicalSessionTsaRoutes);
app.route('/api/http-guard', httpGuardRoutes);
app.route('/api/homomorphic', homomorphicRoutes);
app.route('/api/ssrf-guard', ssrfGuardRoutes);
app.route('/api/advanced-rate-limiter', advancedRateLimiterRoutes);





console.log(`🚀 TerapiaInFoco Backend rodando na porta ${config.port}`);

export default {
  port: config.port,
  reusePort: true,
  fetch: app.fetch
};
