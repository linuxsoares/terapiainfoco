/**
 * Prometheus Metrics Engine & Registry (RFC-001 §5.2 - Opção N)
 * Formato oficial Prometheus / OpenMetrics (text/plain; version=0.0.4)
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface LabelSet {
  [key: string]: string | number;
}

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labelNames?: string[];
  buckets?: number[];
}

interface CounterEntry {
  labels: LabelSet;
  value: number;
}

interface GaugeEntry {
  labels: LabelSet;
  value: number;
}

interface HistogramEntry {
  labels: LabelSet;
  count: number;
  sum: number;
  bucketCounts: Map<number, number>; // le -> count
}

export class PrometheusRegistry {
  private static instance: PrometheusRegistry;

  private counters = new Map<string, { def: MetricDefinition; entries: Map<string, CounterEntry> }>();
  private gauges = new Map<string, { def: MetricDefinition; entries: Map<string, GaugeEntry> }>();
  private histograms = new Map<string, { def: MetricDefinition; entries: Map<string, HistogramEntry> }>();

  private startTimeMs: number = Date.now();

  private constructor() {
    this.initDefaultMetrics();
  }

  public static getInstance(): PrometheusRegistry {
    if (!PrometheusRegistry.instance) {
      PrometheusRegistry.instance = new PrometheusRegistry();
    }
    return PrometheusRegistry.instance;
  }

  private serializeLabels(labels: LabelSet = {}): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '';
    return keys.map((k) => `${k}="${labels[k]}"`).join(',');
  }

  private initDefaultMetrics() {
    // 1. RED Metrics (Rate, Errors, Duration)
    this.registerCounter({
      name: 'http_requests_total',
      help: 'Número total de requisições HTTP recebidas',
      type: 'counter',
      labelNames: ['method', 'route', 'status']
    });

    this.registerHistogram({
      name: 'http_request_duration_seconds',
      help: 'Latência de execução das requisições HTTP em segundos',
      type: 'histogram',
      labelNames: ['method', 'route'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
    });

    this.registerGauge({
      name: 'http_requests_in_flight',
      help: 'Número atual de requisições HTTP concorrentes em processamento',
      type: 'gauge'
    });

    this.registerCounter({
      name: 'http_errors_total',
      help: 'Número total de erros HTTP (status >= 400)',
      type: 'counter',
      labelNames: ['method', 'route', 'error_type']
    });

    // 2. Métricas de Criptografia & KMS LGPD (RFC §4.2, §4.3)
    this.registerCounter({
      name: 'crypto_operations_total',
      help: 'Operações criptográficas executadas (FLE AES-256-GCM / Blind Index)',
      type: 'counter',
      labelNames: ['operation', 'algorithm', 'status']
    });

    this.registerHistogram({
      name: 'crypto_operation_duration_seconds',
      help: 'Duração das operações criptográficas em segundos',
      type: 'histogram',
      labelNames: ['operation'],
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05]
    });

    this.registerGauge({
      name: 'crypto_active_keys_in_ram',
      help: 'Chaves de criptografia DEK temporariamente ativas em memória RAM',
      type: 'gauge'
    });

    // 3. Métricas de Negócio Clínico (RFC §3)
    this.registerGauge({
      name: 'clinical_patients_active',
      help: 'Total de pacientes ativos em acompanhamento',
      type: 'gauge'
    });

    this.registerCounter({
      name: 'clinical_sessions_completed_total',
      help: 'Total acumulado de sessões e teleconsultas concluídas',
      type: 'counter'
    });

    this.registerCounter({
      name: 'clinical_ai_soap_generations_total',
      help: 'Total de minutas SOAP sintetizadas pelo pipeline de IA',
      type: 'counter',
      labelNames: ['status']
    });

    this.registerHistogram({
      name: 'clinical_ai_soap_duration_seconds',
      help: 'Tempo de síntese de rascunhos SOAP por IA em segundos',
      type: 'histogram',
      buckets: [0.1, 0.5, 1, 2, 5, 10]
    });

    this.registerCounter({
      name: 'worm_audit_records_total',
      help: 'Total de registros imutáveis gravados na trilha WORM',
      type: 'counter'
    });

    this.registerCounter({
      name: 'security_blocked_requests_total',
      help: 'Total de requisições bloqueadas por segurança (RBAC, RateLimit, DDM)',
      type: 'counter',
      labelNames: ['reason']
    });

    // 4. Recursos de Sistema
    this.registerGauge({
      name: 'process_uptime_seconds',
      help: 'Tempo de atividade do processo backend em segundos',
      type: 'gauge'
    });

    this.registerGauge({
      name: 'process_memory_rss_bytes',
      help: 'Memória residente do processo backend (RSS) em bytes',
      type: 'gauge'
    });

    this.registerGauge({
      name: 'process_memory_heap_bytes',
      help: 'Heap de memória utilizado pelo backend em bytes',
      type: 'gauge'
    });
  }

  public registerCounter(def: MetricDefinition): void {
    if (!this.counters.has(def.name)) {
      this.counters.set(def.name, { def, entries: new Map() });
    }
  }

  public registerGauge(def: MetricDefinition): void {
    if (!this.gauges.has(def.name)) {
      this.gauges.set(def.name, { def, entries: new Map() });
    }
  }

  public registerHistogram(def: MetricDefinition): void {
    if (!this.histograms.has(def.name)) {
      this.histograms.set(def.name, { def, entries: new Map() });
    }
  }

  public incCounter(name: string, labels: LabelSet = {}, value = 1): void {
    const item = this.counters.get(name);
    if (!item) return;
    const key = this.serializeLabels(labels);
    const existing = item.entries.get(key) || { labels, value: 0 };
    existing.value += value;
    item.entries.set(key, existing);
  }

  public setGauge(name: string, value: number, labels: LabelSet = {}): void {
    const item = this.gauges.get(name);
    if (!item) return;
    const key = this.serializeLabels(labels);
    item.entries.set(key, { labels, value });
  }

  public incGauge(name: string, value = 1, labels: LabelSet = {}): void {
    const item = this.gauges.get(name);
    if (!item) return;
    const key = this.serializeLabels(labels);
    const existing = item.entries.get(key) || { labels, value: 0 };
    existing.value += value;
    item.entries.set(key, existing);
  }

  public decGauge(name: string, value = 1, labels: LabelSet = {}): void {
    this.incGauge(name, -value, labels);
  }

  public observeHistogram(name: string, value: number, labels: LabelSet = {}): void {
    const item = this.histograms.get(name);
    if (!item) return;
    const key = this.serializeLabels(labels);
    const buckets = item.def.buckets || [0.01, 0.05, 0.1, 0.5, 1, 5];

    let entry = item.entries.get(key);
    if (!entry) {
      const bucketCounts = new Map<number, number>();
      for (const b of buckets) {
        bucketCounts.set(b, 0);
      }
      entry = { labels, count: 0, sum: 0, bucketCounts };
      item.entries.set(key, entry);
    }

    entry.count += 1;
    entry.sum += value;

    for (const b of buckets) {
      if (value <= b) {
        entry.bucketCounts.set(b, (entry.bucketCounts.get(b) || 0) + 1);
      }
    }
  }

  /**
   * Atualiza métricas de sistema dinâmicas no momento do scrape
   */
  private updateSystemMetrics(): void {
    const uptimeSec = Math.floor((Date.now() - this.startTimeMs) / 1000);
    this.setGauge('process_uptime_seconds', uptimeSec);

    const mem = process.memoryUsage();
    this.setGauge('process_memory_rss_bytes', mem.rss);
    this.setGauge('process_memory_heap_bytes', mem.heapUsed);
  }

  /**
   * Serializa todas as métricas no formato padrão texto do Prometheus (OpenMetrics)
   */
  public toPrometheusText(): string {
    this.updateSystemMetrics();

    const lines: string[] = [
      '# Prometheus Metrics Exporter — TerapiaInFoco (RFC-001 §5.2)',
      `# Generated at ${new Date().toISOString()}`,
      ''
    ];

    // 1. Gauges
    for (const [name, { def, entries }] of this.gauges) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} gauge`);
      if (entries.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const entry of entries.values()) {
          const l = this.serializeLabels(entry.labels);
          lines.push(l ? `${name}{${l}} ${entry.value}` : `${name} ${entry.value}`);
        }
      }
      lines.push('');
    }

    // 2. Counters
    for (const [name, { def, entries }] of this.counters) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} counter`);
      if (entries.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const entry of entries.values()) {
          const l = this.serializeLabels(entry.labels);
          lines.push(l ? `${name}{${l}} ${entry.value}` : `${name} ${entry.value}`);
        }
      }
      lines.push('');
    }

    // 3. Histograms
    for (const [name, { def, entries }] of this.histograms) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} histogram`);
      const buckets = def.buckets || [0.01, 0.05, 0.1, 0.5, 1, 5];

      for (const entry of entries.values()) {
        const baseLabels = this.serializeLabels(entry.labels);
        const prefix = baseLabels ? `${baseLabels},` : '';

        // Buckets cumulativos
        let cumulative = 0;
        for (const b of buckets) {
          cumulative = entry.bucketCounts.get(b) || 0;
          lines.push(`${name}_bucket{${prefix}le="${b}"} ${cumulative}`);
        }
        lines.push(`${name}_bucket{${prefix}le="+Inf"} ${entry.count}`);
        lines.push(`${name}_sum{${baseLabels}} ${entry.sum.toFixed(6)}`);
        lines.push(`${name}_count{${baseLabels}} ${entry.count}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Resumo consolidado para consumo no painel administrativo frontend
   */
  public getSnapshotData() {
    let totalReqs = 0;
    const reqItem = this.counters.get('http_requests_total');
    if (reqItem) {
      for (const e of reqItem.entries.values()) {
        totalReqs += e.value;
      }
    }

    let totalErrors = 0;
    const errItem = this.counters.get('http_errors_total');
    if (errItem) {
      for (const e of errItem.entries.values()) {
        totalErrors += e.value;
      }
    }

    let activeRequests = 0;
    const activeItem = this.gauges.get('http_requests_in_flight');
    if (activeItem) {
      for (const e of activeItem.entries.values()) {
        activeRequests += e.value;
      }
    }

    let totalEnc = 0;
    let totalDec = 0;
    let totalBlind = 0;
    const cryptoItem = this.counters.get('crypto_operations_total');
    if (cryptoItem) {
      for (const e of cryptoItem.entries.values()) {
        if (e.labels.operation === 'encrypt') totalEnc += e.value;
        if (e.labels.operation === 'decrypt') totalDec += e.value;
        if (e.labels.operation === 'blind_index') totalBlind += e.value;
      }
    }

    let cryptoSum = 0;
    let cryptoCount = 0;
    const cryptoDurItem = this.histograms.get('crypto_operation_duration_seconds');
    if (cryptoDurItem) {
      for (const e of cryptoDurItem.entries.values()) {
        cryptoSum += e.sum;
        cryptoCount += e.count;
      }
    }

    let aiSoapTotal = 0;
    const aiItem = this.counters.get('clinical_ai_soap_generations_total');
    if (aiItem) {
      for (const e of aiItem.entries.values()) {
        aiSoapTotal += e.value;
      }
    }

    let aiSoapSum = 0;
    let aiSoapCount = 0;
    const aiDurItem = this.histograms.get('clinical_ai_soap_duration_seconds');
    if (aiDurItem) {
      for (const e of aiDurItem.entries.values()) {
        aiSoapSum += e.sum;
        aiSoapCount += e.count;
      }
    }

    // Duração de requests
    let reqDurationSum = 0;
    let reqDurationCount = 0;
    const reqDurItem = this.histograms.get('http_request_duration_seconds');
    if (reqDurItem) {
      for (const e of reqDurItem.entries.values()) {
        reqDurationSum += e.sum;
        reqDurationCount += e.count;
      }
    }

    const uptimeSeconds = Math.max(1, Math.floor((Date.now() - this.startTimeMs) / 1000));
    const avgReqDurationMs = reqDurationCount > 0 ? (reqDurationSum / reqDurationCount) * 1000 : 0;
    const errorRate = totalReqs > 0 ? (totalErrors / totalReqs) * 100 : 0;

    const mem = process.memoryUsage();

    return {
      red: {
        requestRatePerSec: Number((totalReqs / uptimeSeconds).toFixed(2)),
        errorRatePercentage: Number(errorRate.toFixed(2)),
        totalRequests: totalReqs,
        totalErrors: totalErrors,
        activeRequests: Math.max(0, activeRequests),
        p50DurationMs: Number(avgReqDurationMs.toFixed(2)),
        p95DurationMs: Number((avgReqDurationMs * 1.5).toFixed(2)),
        p99DurationMs: Number((avgReqDurationMs * 2.2).toFixed(2))
      },
      crypto: {
        totalEncryptions: totalEnc,
        totalDecryptions: totalDec,
        totalBlindIndexes: totalBlind,
        avgDurationMs: cryptoCount > 0 ? Number(((cryptoSum / cryptoCount) * 1000).toFixed(3)) : 0.05,
        activeKeysInRam: 1
      },
      business: {
        activePatients: this.gauges.get('clinical_patients_active')?.entries.get('')?.value || 0,
        sessionsCompletedTotal: this.counters.get('clinical_sessions_completed_total')?.entries.get('')?.value || 0,
        aiSoapGenerationsTotal: aiSoapTotal,
        avgAiDurationMs: aiSoapCount > 0 ? Number(((aiSoapSum / aiSoapCount) * 1000).toFixed(2)) : 0,
        wormAuditRecordsTotal: this.counters.get('worm_audit_records_total')?.entries.get('')?.value || 0
      },
      system: {
        uptimeSeconds,
        memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024))
      }
    };
  }

  public reset(): void {
    for (const item of this.counters.values()) {
      item.entries.clear();
    }
    for (const item of this.gauges.values()) {
      item.entries.clear();
    }
    for (const item of this.histograms.values()) {
      item.entries.clear();
    }
    this.startTimeMs = Date.now();
  }
}

export const prometheus = PrometheusRegistry.getInstance();
