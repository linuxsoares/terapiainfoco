import { prometheus } from './prometheusRegistry';
import { tracer } from './openTelemetryTracer';
import { otlpBatchExporter } from './otlpBatchExporter';
import { db } from '../db/memoryDb';
import type {
  TelemetryOverview,
  TraceSpan,
  UpdateOtlpConfigDTO,
  TestOtlpExportDTO,
  OtlpExporterConfig,
  OtlpExporterStats,
  OtlpBatchExportResult
} from '@terapiainfoco/shared';

import { PatientRepository } from '../repositories/patientRepository';
// Conecta o coletor de traces ao despachador em lote OTLP
tracer.setSpanCompletedListener((span) => {
  otlpBatchExporter.enqueueSpan(span);
});

export class TelemetryService {
  /**
   * Registra a execução de uma operação criptográfica com métricas e rastreamento
   */
  public static recordCryptoOperation(
    operation: 'encrypt' | 'decrypt' | 'blind_index',
    durationMs: number,
    success = true
  ): void {
    const durationSeconds = durationMs / 1000;
    prometheus.incCounter('crypto_operations_total', {
      operation,
      algorithm: operation === 'blind_index' ? 'hmac-sha256' : 'aes-256-gcm',
      status: success ? 'success' : 'failure'
    });

    prometheus.observeHistogram('crypto_operation_duration_seconds', durationSeconds, {
      operation
    });
  }

  /**
   * Registra a conclusão de uma consulta/sessão clínica
   */
  public static recordSessionCompleted(): void {
    prometheus.incCounter('clinical_sessions_completed_total');
  }

  /**
   * Registra a síntese de minuta SOAP por IA
   */
  public static recordAiSoapGeneration(durationMs: number, success = true): void {
    const durationSeconds = durationMs / 1000;
    prometheus.incCounter('clinical_ai_soap_generations_total', {
      status: success ? 'success' : 'failure'
    });

    prometheus.observeHistogram('clinical_ai_soap_duration_seconds', durationSeconds);
  }

  /**
   * Registra gravação na trilha WORM
   */
  public static recordWormLog(): void {
    prometheus.incCounter('worm_audit_records_total');
  }

  /**
   * Retorna os dados consolidados de observabilidade e RED metrics para a interface
   */
  public static async getOverview(): Promise<TelemetryOverview> {
    // Sincroniza gauges com estado atual do banco
    const activePatients = await PatientRepository.count();
    prometheus.setGauge('clinical_patients_active', activePatients);
    prometheus.setGauge('worm_audit_records_total', db.auditLogs.length);

    const snapshot = prometheus.getSnapshotData();
    const recentTraces = tracer.getRecentSpans(15);

    return {
      timestamp: new Date().toISOString(),
      service: 'terapiainfoco-backend',
      version: '1.0.0',
      red: snapshot.red,
      crypto: snapshot.crypto,
      business: {
        ...snapshot.business,
        activePatients,
        wormAuditRecordsTotal: db.auditLogs.length
      },
      system: snapshot.system,
      recentTraces
    };
  }

  /**
   * Retorna os últimos spans do coletor OpenTelemetry
   */
  public static getTraces(limit = 50): TraceSpan[] {
    return tracer.getRecentSpans(limit);
  }

  /**
   * Retorna o payload textual no padrão oficial do Prometheus
   */
  public static async getPrometheusMetricsText(): Promise<string> {
    prometheus.setGauge('clinical_patients_active', await PatientRepository.count());
    prometheus.setGauge('worm_audit_records_total', db.auditLogs.length);
    return prometheus.toPrometheusText();
  }

  /**
   * Obtém as configurações e status do exportador OTLP
   */
  public static getOtlpStatus(): { config: OtlpExporterConfig; stats: OtlpExporterStats } {
    return {
      config: otlpBatchExporter.getConfig(),
      stats: otlpBatchExporter.getStats()
    };
  }

  /**
   * Atualiza a configuração do exportador OTLP com auditoria WORM
   */
  public static updateOtlpConfig(
    update: UpdateOtlpConfigDTO,
    actorId: string,
    ip: string
  ): OtlpExporterConfig {
    return otlpBatchExporter.updateConfig(update, actorId, ip);
  }

  /**
   * Força a emissão imediata do lote de telemetria acumulado
   */
  public static async flushOtlp(): Promise<OtlpBatchExportResult> {
    return otlpBatchExporter.flush();
  }

  /**
   * Testa a conectividade com o coletor remoto OTLP configurado
   */
  public static async testOtlpConnection(
    params?: TestOtlpExportDTO
  ): Promise<OtlpBatchExportResult> {
    return otlpBatchExporter.testConnection(params);
  }
}

