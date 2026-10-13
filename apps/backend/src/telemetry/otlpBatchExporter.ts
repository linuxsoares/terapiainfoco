import {
  OtlpExporterProvider,
  OtlpExportStatus,
  type OtlpExporterConfig,
  type OtlpExporterStats,
  type OtlpBatchExportResult,
  type UpdateOtlpConfigDTO,
  type TestOtlpExportDTO,
  type TraceSpan,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import {
  buildOtlpHeaders,
  resolveOtlpEndpoint,
  formatOtlpTracesPayload,
  formatOtlpMetricsPayload,
  validateOtlpEndpoint
} from '@terapiainfoco/crypto';
import { AuditService } from '../services/auditService';
import { prometheus } from './prometheusRegistry';

export class OtlpBatchExporter {
  private static instance: OtlpBatchExporter;

  private config: OtlpExporterConfig = {
    enabled: true, // Habilitado por padrão para observabilidade OTLP
    provider: OtlpExporterProvider.GENERIC_COLLECTOR,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    apiKey: process.env.OTEL_EXPORTER_OTLP_API_KEY || '',
    batchSize: 20,
    flushIntervalSeconds: 10,
    customHeaders: {},
    exportTraces: true,
    exportMetrics: true,
    serviceName: process.env.OTEL_SERVICE_NAME || 'terapiainfoco-backend',
    environment: process.env.NODE_ENV || 'production'
  };

  private queue: TraceSpan[] = [];
  private maxQueueSize = 500;
  private flushTimer: NodeJS.Timeout | null = null;
  private customFetch?: typeof fetch;

  private stats: OtlpExporterStats = {
    status: OtlpExportStatus.ACTIVE,
    queuedSpansCount: 0,
    totalExportedSpans: 0,
    totalExportedBatches: 0,
    failedBatchesCount: 0,
    successRate: 100,
    endpoint: 'http://localhost:4318',
    provider: OtlpExporterProvider.GENERIC_COLLECTOR
  };

  constructor(fetchHandler?: typeof fetch) {
    if (fetchHandler) {
      this.customFetch = fetchHandler;
    }
    this.syncStatsMetadata();
    this.start();
  }

  public static getInstance(): OtlpBatchExporter {
    if (!OtlpBatchExporter.instance) {
      OtlpBatchExporter.instance = new OtlpBatchExporter();
    }
    return OtlpBatchExporter.instance;
  }

  public setFetchHandler(handler?: typeof fetch): void {
    this.customFetch = handler;
  }

  /**
   * Inicia o timer periódico de flush em segundo plano
   */
  public start(): void {
    this.stop();
    const intervalMs = Math.max(1, this.config.flushIntervalSeconds) * 1000;
    this.flushTimer = setInterval(() => {
      if (this.config.enabled && this.queue.length > 0) {
        this.flush().catch((err) => {
          console.warn('[OTLP Exporter] Falha no auto-flush periódico:', err?.message || err);
        });
      }
    }, intervalMs);

    // Unref para não prender o processo do Node/Bun
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  /**
   * Pausa o timer de flush periódico
   */
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Enfileira um span rastreado para exportação em lote
   */
  public enqueueSpan(span: TraceSpan): void {
    if (!this.config.enabled || !this.config.exportTraces) {
      return;
    }

    this.queue.push(span);
    if (this.queue.length > this.maxQueueSize) {
      // Descarta os mais antigos para proteger a memória do processo
      this.queue.shift();
    }

    this.stats.queuedSpansCount = this.queue.length;

    // Dispara flush imediato se atingir o tamanho do lote configurado
    if (this.queue.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  /**
   * Força o envio em lote de todos os spans acumulados no buffer
   */
  public async flush(): Promise<OtlpBatchExportResult> {
    if (this.queue.length === 0) {
      return {
        success: true,
        batchesSent: 0,
        spansCount: 0,
        metricsCount: 0,
        durationMs: 0,
        endpoint: this.config.endpoint,
        timestamp: new Date().toISOString()
      };
    }

    const batch = [...this.queue];
    this.queue = [];
    this.stats.queuedSpansCount = 0;

    const startPerf = performance.now();
    const resolved = resolveOtlpEndpoint(this.config.provider, this.config.endpoint);
    const headers = buildOtlpHeaders(this.config.provider, this.config.apiKey, this.config.customHeaders);

    const payload = formatOtlpTracesPayload(batch, {
      serviceName: this.config.serviceName,
      serviceVersion: '1.0.0',
      environment: this.config.environment
    });

    const activeFetch = this.customFetch || fetch;

    try {
      const response = await activeFetch(resolved.tracesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });

      const durationMs = Math.round(performance.now() - startPerf);
      this.stats.lastLatencyMs = durationMs;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      this.stats.totalExportedSpans += batch.length;
      this.stats.totalExportedBatches += 1;
      this.stats.lastExportAt = new Date().toISOString();
      this.stats.lastError = undefined;
      this.stats.status = OtlpExportStatus.ACTIVE;
      this.recalculateSuccessRate();

      // Exportação opcional de métricas OTLP se habilitada
      let metricsCount = 0;
      if (this.config.exportMetrics) {
        metricsCount = await this.exportMetricsSnapshot(resolved.metricsUrl, headers);
      }

      return {
        success: true,
        batchesSent: 1,
        spansCount: batch.length,
        metricsCount,
        durationMs,
        statusCode: response.status,
        endpoint: resolved.tracesUrl,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startPerf);
      const errorMessage = err?.message || String(err);

      this.stats.failedBatchesCount += 1;
      this.stats.lastError = errorMessage;
      this.stats.status = this.stats.failedBatchesCount > 3 ? OtlpExportStatus.ERROR : OtlpExportStatus.DEGRADED;
      this.recalculateSuccessRate();

      // Re-enfileira os spans caso não exceda o tamanho máximo de segurança
      const spaceLeft = this.maxQueueSize - this.queue.length;
      if (spaceLeft > 0) {
        this.queue.unshift(...batch.slice(0, spaceLeft));
        this.stats.queuedSpansCount = this.queue.length;
      }

      return {
        success: false,
        batchesSent: 0,
        spansCount: batch.length,
        metricsCount: 0,
        durationMs,
        endpoint: resolved.tracesUrl,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Exporta métricas consolidadas via OTLP /v1/metrics
   */
  private async exportMetricsSnapshot(metricsUrl: string, headers: Record<string, string>): Promise<number> {
    try {
      const activeFetch = this.customFetch || fetch;
      const snapshot = prometheus.getSnapshotData();
      const payload = formatOtlpMetricsPayload(snapshot, {
        serviceName: this.config.serviceName,
        serviceVersion: '1.0.0',
        environment: this.config.environment
      });

      await activeFetch(metricsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000)
      });

      return payload.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.length || 0;
    } catch {
      // Falha de métricas secundária não quebra o pipeline de traces
      return 0;
    }
  }

  /**
   * Dispara um teste sob demanda enviando 1 span sintético para o coletor
   */
  public async testConnection(params?: TestOtlpExportDTO): Promise<OtlpBatchExportResult> {
    const provider = params?.provider || this.config.provider;
    const endpoint = params?.endpoint || this.config.endpoint;
    const apiKey = params?.apiKey !== undefined ? params.apiKey : this.config.apiKey;
    const customHeaders = { ...(this.config.customHeaders || {}), ...(params?.customHeaders || {}) };

    const validation = validateOtlpEndpoint(endpoint);
    if (!validation.valid) {
      return {
        success: false,
        batchesSent: 0,
        spansCount: 0,
        metricsCount: 0,
        durationMs: 0,
        endpoint,
        error: validation.error || 'Endpoint inválido.',
        timestamp: new Date().toISOString()
      };
    }

    const testSpan: TraceSpan = {
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      name: 'terapiainfoco.otlp.test_connection',
      kind: 'INTERNAL',
      startTimeMs: Date.now() - 5,
      endTimeMs: Date.now(),
      durationMs: 5,
      status: 'OK',
      attributes: {
        'test.probe': true,
        'provider': provider,
        'compliance.lgpd': true
      }
    };

    const resolved = resolveOtlpEndpoint(provider, endpoint);
    const headers = buildOtlpHeaders(provider, apiKey, customHeaders);
    const payload = formatOtlpTracesPayload([testSpan], {
      serviceName: this.config.serviceName,
      serviceVersion: '1.0.0',
      environment: this.config.environment
    });

    const activeFetch = this.customFetch || fetch;
    const startPerf = performance.now();

    try {
      const res = await activeFetch(resolved.tracesUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });

      const durationMs = Math.round(performance.now() - startPerf);

      if (!res.ok) {
        return {
          success: false,
          batchesSent: 0,
          spansCount: 1,
          metricsCount: 0,
          durationMs,
          statusCode: res.status,
          endpoint: resolved.tracesUrl,
          error: `O coletor OTLP respondeu com HTTP ${res.status}: ${res.statusText}`,
          timestamp: new Date().toISOString()
        };
      }

      return {
        success: true,
        batchesSent: 1,
        spansCount: 1,
        metricsCount: 0,
        durationMs,
        statusCode: res.status,
        endpoint: resolved.tracesUrl,
        timestamp: new Date().toISOString()
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startPerf);
      return {
        success: false,
        batchesSent: 0,
        spansCount: 1,
        metricsCount: 0,
        durationMs,
        endpoint: resolved.tracesUrl,
        error: err?.message || 'Falha de conexão com o coletor OTLP.',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Atualiza a configuração do exportador OTLP e registra na trilha WORM
   */
  public updateConfig(update: UpdateOtlpConfigDTO, actorId = 'admin', ip = '127.0.0.1'): OtlpExporterConfig {
    if (update.endpoint) {
      const val = validateOtlpEndpoint(update.endpoint);
      if (!val.valid) {
        throw new Error(val.error || 'Endpoint inválido.');
      }
    }

    if (update.enabled !== undefined) this.config.enabled = update.enabled;
    if (update.provider) this.config.provider = update.provider;
    if (update.endpoint) this.config.endpoint = update.endpoint.trim();
    if (update.apiKey !== undefined) this.config.apiKey = update.apiKey.trim();
    if (update.batchSize && update.batchSize >= 1 && update.batchSize <= 500) {
      this.config.batchSize = update.batchSize;
    }
    if (update.flushIntervalSeconds && update.flushIntervalSeconds >= 1 && update.flushIntervalSeconds <= 300) {
      this.config.flushIntervalSeconds = update.flushIntervalSeconds;
      this.start(); // Reinicia o timer com o novo intervalo
    }
    if (update.customHeaders !== undefined) this.config.customHeaders = update.customHeaders;
    if (update.exportTraces !== undefined) this.config.exportTraces = update.exportTraces;
    if (update.exportMetrics !== undefined) this.config.exportMetrics = update.exportMetrics;
    if (update.serviceName) this.config.serviceName = update.serviceName;
    if (update.environment) this.config.environment = update.environment;

    this.syncStatsMetadata();
    if (!this.config.enabled) {
      this.stats.status = OtlpExportStatus.PAUSED;
    } else if (this.stats.status === OtlpExportStatus.PAUSED) {
      this.stats.status = OtlpExportStatus.ACTIVE;
    }

    // Registra alteração de configuração na trilha de auditoria WORM
    AuditService.log({
      action: AuditAction.OTLP_EXPORT_CONFIG_UPDATE,
      resourceType: AuditResourceType.TELEMETRY,
      resourceId: `otlp-${this.config.provider}`,
      details: {
        enabled: this.config.enabled,
        provider: this.config.provider,
        endpoint: this.config.endpoint,
        batchSize: this.config.batchSize,
        flushIntervalSeconds: this.config.flushIntervalSeconds,
        exportTraces: this.config.exportTraces,
        exportMetrics: this.config.exportMetrics
      },
      actorId,
      ipAddress: ip
    });

    return this.getSafeConfig();
  }

  public getConfig(): OtlpExporterConfig {
    return this.getSafeConfig();
  }

  public getRawConfig(): OtlpExporterConfig {
    return { ...this.config };
  }

  private getSafeConfig(): OtlpExporterConfig {
    const raw = { ...this.config };
    if (raw.apiKey && raw.apiKey.length > 4) {
      raw.apiKey = `••••••••${raw.apiKey.slice(-4)}`;
    }
    return raw;
  }

  public getStats(): OtlpExporterStats {
    this.stats.queuedSpansCount = this.queue.length;
    return { ...this.stats };
  }

  public clearQueue(): void {
    this.queue = [];
    this.stats.queuedSpansCount = 0;
  }

  public resetStats(): void {
    this.stats.totalExportedSpans = 0;
    this.stats.totalExportedBatches = 0;
    this.stats.failedBatchesCount = 0;
    this.stats.successRate = 100;
    this.stats.lastError = undefined;
    this.stats.lastExportAt = undefined;
    this.stats.lastLatencyMs = undefined;
  }

  private recalculateSuccessRate(): void {
    const total = this.stats.totalExportedBatches + this.stats.failedBatchesCount;
    if (total === 0) {
      this.stats.successRate = 100;
    } else {
      this.stats.successRate = Number(((this.stats.totalExportedBatches / total) * 100).toFixed(1));
    }
  }

  private syncStatsMetadata(): void {
    this.stats.endpoint = this.config.endpoint;
    this.stats.provider = this.config.provider;
  }
}

export const otlpBatchExporter = OtlpBatchExporter.getInstance();
