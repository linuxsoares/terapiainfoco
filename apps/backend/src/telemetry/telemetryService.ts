import { prometheus } from './prometheusRegistry';
import { tracer } from './openTelemetryTracer';
import { db } from '../db/memoryDb';
import type { TelemetryOverview, TraceSpan } from '@terapiainfoco/shared';

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
  public static getOverview(): TelemetryOverview {
    // Sincroniza gauges com estado atual do banco
    prometheus.setGauge('clinical_patients_active', db.patients.size);
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
        activePatients: db.patients.size,
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
  public static getPrometheusMetricsText(): string {
    prometheus.setGauge('clinical_patients_active', db.patients.size);
    prometheus.setGauge('worm_audit_records_total', db.auditLogs.length);
    return prometheus.toPrometheusText();
  }
}
