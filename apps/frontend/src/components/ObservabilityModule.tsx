import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  FileCheck2, 
  Activity, 
  AlertTriangle, 
  Clock, 
  Radio,
  Cpu,
  Layers,
  Copy,
  Check,
  Server,
  Lock,
  ChevronRight,
  Terminal,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  Send,
  Settings2,
  Cloud,
  Play,
  SlidersHorizontal
} from 'lucide-react';
import { api } from '../services/api';
import type { 
  SecurityMetrics, 
  TelemetryOverview,
  TraceSpan,
  OtlpExporterConfig,
  OtlpExporterStats,
  OtlpBatchExportResult
} from '@terapiainfoco/shared';
import { OtlpExporterProvider } from '@terapiainfoco/shared';

export function ObservabilityModule() {
  const [viewMode, setViewMode] = useState<'security' | 'telemetry'>('security');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryOverview | null>(null);
  const [telemetryTraces, setTelemetryTraces] = useState<TraceSpan[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<TraceSpan | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [rawPrometheus, setRawPrometheus] = useState<string | null>(null);
  const [showPrometheusModal, setShowPrometheusModal] = useState<boolean>(false);
  const [copiedPrometheus, setCopiedPrometheus] = useState<boolean>(false);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  // Exportador OTLP & Coletores Remotos (Datadog, New Relic, Dynatrace)
  const [otlpConfig, setOtlpConfig] = useState<OtlpExporterConfig | null>(null);
  const [otlpStats, setOtlpStats] = useState<OtlpExporterStats | null>(null);
  const [flushingOtlp, setFlushingOtlp] = useState(false);
  const [testingOtlp, setTestingOtlp] = useState(false);
  const [testResult, setTestResult] = useState<OtlpBatchExportResult | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [otlpFeedback, setOtlpFeedback] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<{
    enabled: boolean;
    provider: OtlpExporterProvider;
    endpoint: string;
    apiKey: string;
    batchSize: number;
    flushIntervalSeconds: number;
    exportTraces: boolean;
    exportMetrics: boolean;
  }>({
    enabled: true,
    provider: OtlpExporterProvider.GENERIC_COLLECTOR,
    endpoint: 'http://localhost:4318',
    apiKey: '',
    batchSize: 20,
    flushIntervalSeconds: 10,
    exportTraces: true,
    exportMetrics: true
  });

  const loadData = async () => {
    try {
      setError(null);
      const [security, telem, otlp] = await Promise.all([
        api.getSecurityMetrics(),
        api.getTelemetryOverview().catch(() => null),
        api.getOtlpStatus().catch(() => null)
      ]);
      setSecurityMetrics(security);
      if (telem) {
        setTelemetry(telem);
        setTelemetryTraces(telem.recentTraces || []);
      }
      if (otlp) {
        setOtlpConfig(otlp.config);
        setOtlpStats(otlp.stats);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar métricas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTelemetry = async () => {
    try {
      setLoadingTelemetry(true);
      const [tOverview, tTraces, otlp] = await Promise.all([
        api.getTelemetryOverview(),
        api.getTelemetryTraces(40),
        api.getOtlpStatus().catch(() => null)
      ]);
      setTelemetry(tOverview);
      setTelemetryTraces(tTraces);
      if (otlp) {
        setOtlpConfig(otlp.config);
        setOtlpStats(otlp.stats);
      }
    } catch (err: any) {
      console.error('Falha ao carregar telemetria:', err);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  const handleFlushOtlp = async () => {
    try {
      setFlushingOtlp(true);
      setOtlpFeedback(null);
      const res = await api.flushOtlp();
      if (res.stats) setOtlpStats(res.stats);
      setOtlpFeedback(`Lote OTLP despachado com sucesso! ${res.result.spansCount} spans enviados para ${res.result.endpoint}.`);
      setTimeout(() => setOtlpFeedback(null), 5000);
    } catch (err: any) {
      setOtlpFeedback(`Falha no flush OTLP: ${err?.message || err}`);
      setTimeout(() => setOtlpFeedback(null), 5000);
    } finally {
      setFlushingOtlp(false);
    }
  };

  const handleTestOtlp = async () => {
    try {
      setTestingOtlp(true);
      setTestResult(null);
      const res = await api.testOtlpConnection();
      setTestResult(res.result);
    } catch (err: any) {
      setTestResult({
        success: false,
        batchesSent: 0,
        spansCount: 0,
        metricsCount: 0,
        durationMs: 0,
        endpoint: otlpConfig?.endpoint || '',
        error: err?.message || 'Falha no teste de conexão OTLP',
        timestamp: new Date().toISOString()
      });
    } finally {
      setTestingOtlp(false);
    }
  };

  const handleOpenConfigModal = () => {
    if (otlpConfig) {
      setConfigForm({
        enabled: otlpConfig.enabled,
        provider: otlpConfig.provider,
        endpoint: otlpConfig.endpoint,
        apiKey: '',
        batchSize: otlpConfig.batchSize,
        flushIntervalSeconds: otlpConfig.flushIntervalSeconds,
        exportTraces: otlpConfig.exportTraces,
        exportMetrics: otlpConfig.exportMetrics
      });
    }
    setShowConfigModal(true);
  };

  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const res = await api.updateOtlpConfig({
        enabled: configForm.enabled,
        provider: configForm.provider,
        endpoint: configForm.endpoint,
        ...(configForm.apiKey ? { apiKey: configForm.apiKey } : {}),
        batchSize: configForm.batchSize,
        flushIntervalSeconds: configForm.flushIntervalSeconds,
        exportTraces: configForm.exportTraces,
        exportMetrics: configForm.exportMetrics
      });
      setOtlpConfig(res.config);
      setShowConfigModal(false);
      setOtlpFeedback('Configuração do exportador OTLP atualizada com sucesso.');
      setTimeout(() => setOtlpFeedback(null), 4000);

      const statusRes = await api.getOtlpStatus().catch(() => null);
      if (statusRes) {
        setOtlpConfig(statusRes.config);
        setOtlpStats(statusRes.stats);
      }
    } catch (err: any) {
      alert(`Erro ao salvar configuração: ${err?.message || err}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleOpenPrometheusModal = async () => {
    try {
      const text = await api.getRawPrometheusMetrics();
      setRawPrometheus(text);
      setShowPrometheusModal(true);
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar payload Prometheus');
    }
  };

  const handleCopyPrometheus = () => {
    if (rawPrometheus) {
      navigator.clipboard.writeText(rawPrometheus);
      setCopiedPrometheus(true);
      setTimeout(() => setCopiedPrometheus(false), 2000);
    }
  };

  const handleCopyTraceId = (traceId: string) => {
    navigator.clipboard.writeText(traceId);
    setCopiedTraceId(traceId);
    setTimeout(() => setCopiedTraceId(null), 2000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    if (viewMode === 'telemetry') {
      loadTelemetry().finally(() => setRefreshing(false));
    } else {
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <RefreshCw className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando indicadores de segurança e observabilidade...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com alternador de visão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Segurança & Observabilidade
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Integridade da trilha de auditoria, tentativas de acesso e saúde da plataforma
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de Modo: Segurança vs Telemetria */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('security')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'security'
                  ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Segurança
            </button>
            <button
              onClick={() => {
                setViewMode('telemetry');
                if (!telemetry) loadTelemetry();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'telemetry'
                  ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Desempenho
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar Indicadores"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. VISÃO DE SEGURANÇA & WORM                                             */}
      {/* ========================================================================= */}
      {viewMode === 'security' && securityMetrics && (
        <div className="space-y-6">
          {/* Card Master de Integridade WORM */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-500/30 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Trilha de Auditoria WORM (RFC-001 §4.4)
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Status de Integridade: {securityMetrics.wormIntegrityStatus === 'INTACT' ? 'INVIOLÁVEL & INTACTA' : 'ALERTA'}
                </h2>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  Todos os registros são gravados em modelo *Write Once, Read Many* com congelamento de objetos em memória e persistência imutável. Zero adulterações detectadas.
                </p>
              </div>

              <div className="text-right sm:border-l sm:border-emerald-500/30 sm:pl-6 shrink-0">
                <span className="text-3xl font-black text-white">{securityMetrics.totalAuditLogs}</span>
                <p className="text-[11px] text-emerald-300 font-semibold mt-0.5">Logs Auditados</p>
              </div>
            </div>
          </div>

          {/* Grade de 4 KPIs de Segurança */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Leituras FLE Decifradas</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.totalDecryptReads}
                </span>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">DEK verificada</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Acessos a dados clínicos em repouso</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Assinaturas Registradas</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.totalSignatures}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">SHA-256</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Prontuários e laudos com selo de imutabilidade</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rate Limit Bloqueios</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.rateLimitBlocksCount}
                </span>
                <span className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">HTTP 429</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Tentativas de força bruta interceptadas</p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Adoção de 2FA / MFA</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {securityMetrics.twoFactorAdoptionRate}%
                </span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">TOTP RFC 6238</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Contas protegidas com segundo fator</p>
            </div>
          </div>

          {/* Distribuição de Eventos por Ação & Feed de Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Eventos por Ação */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Eventos de Auditoria por Ação
              </h3>

              <div className="space-y-2.5 pt-2">
                {Object.entries(securityMetrics.auditEventsByAction).map(([action, count]) => (
                  <div key={action} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                    <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{action}</span>
                    <span className="font-bold text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      {count} eventos
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feed de Alertas e Eventos de Segurança Recentes */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Feed de Observabilidade de Segurança
              </h3>

              <div className="space-y-2 pt-2 max-h-[350px] overflow-y-auto pr-1">
                {securityMetrics.recentSecurityAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Nenhum evento registrado ainda.</p>
                ) : (
                  securityMetrics.recentSecurityAlerts.map(alert => (
                    <div 
                      key={alert.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1 bg-slate-50/50 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          alert.severity === 'ALERT'
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                            : alert.severity === 'WARN'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20'
                        }`}>
                          {alert.severity}: {alert.action}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(alert.timestamp).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300">{alert.detail}</p>
                      <p className="text-[10px] text-slate-400 font-mono">IP: {alert.ipAddress}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. VISÃO DE TELEMETRIA OPENTELEMETRY & MÉTRICAS PROMETHEUS (RFC §5.2 - N) */}
      {/* ========================================================================= */}
      {viewMode === 'telemetry' && (
        <div className="space-y-6">
          {/* Barra de Status e Ações do Sistema de Observabilidade */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Tracing Distribuído OTel & Exportador Prometheus
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    OpenMetrics v0.0.4 Ativo
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Conformidade W3C Trace Context (<code className="font-mono text-teal-600 dark:text-teal-400">traceparent</code>) e Métricas RED em tempo real
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleOpenPrometheusModal}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Ver Endpoint Prometheus (GET /metrics)</span>
              </button>

              <button
                onClick={loadTelemetry}
                disabled={loadingTelemetry}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTelemetry ? 'animate-spin' : ''}`} />
                <span>Atualizar Traces</span>
              </button>
            </div>
          </div>

          {/* Grade 1: 4 Cards RED Metrics (Rate, Errors, Duration) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI RED 1: Rate (Taxa de Requisições) */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">RED: Rate</span>
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                  <Zap className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.red.requestRatePerSec ?? 0}
                </span>
                <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">req/s</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {telemetry?.red.totalRequests ?? 0} requisições totais processadas
              </p>
            </div>

            {/* KPI RED 2: Errors (Taxa de Erros) */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">RED: Errors</span>
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.red.errorRatePercentage ?? 0}%
                </span>
                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {telemetry?.red.totalErrors ?? 0} erros
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Status 4xx/5xx monitorados por normalização de rota
              </p>
            </div>

            {/* KPI RED 3: Duration (Latência P50/P95/P99) */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">RED: Duration (P95)</span>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.red.p95DurationMs ?? 0}
                </span>
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">ms</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                P50: {telemetry?.red.p50DurationMs ?? 0}ms • P99: {telemetry?.red.p99DurationMs ?? 0}ms
              </p>
            </div>

            {/* KPI RED 4: Concorrência (In-Flight) */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Concorrência Ativa</span>
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.red.activeRequests ?? 0}
                </span>
                <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">in-flight</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Requisições em processamento simultâneo
              </p>
            </div>
          </div>

          {/* Grade 2: 4 Cards de Criptografia & Recursos de Infraestrutura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Cifragem FLE */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cifragem FLE (KMS)</span>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {(telemetry?.crypto.totalEncryptions ?? 0) + (telemetry?.crypto.totalDecryptions ?? 0)}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {telemetry?.crypto.avgDurationMs ?? 0}ms méd
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {telemetry?.crypto.totalEncryptions ?? 0} enc / {telemetry?.crypto.totalDecryptions ?? 0} dec (AES-256-GCM)
              </p>
            </div>

            {/* Blind Indexes & RAM */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Blind Indexes & DEKs</span>
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Cpu className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.crypto.totalBlindIndexes ?? 0}
                </span>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  {telemetry?.crypto.activeKeysInRam ?? 0} DEKs em RAM
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                HMAC-SHA256 para buscas indexadas sem quebra de anonimato
              </p>
            </div>

            {/* Memória & Processo */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memória RSS & Heap</span>
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <Server className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.system.memoryRssMb ?? 0}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">MB (RSS)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Heap: {telemetry?.system.heapUsedMb ?? 0} MB / {telemetry?.system.heapTotalMb ?? 0} MB
              </p>
            </div>

            {/* Negócio & WORM */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">IA & Auditoria WORM</span>
                <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
                  <FileCheck2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                  {telemetry?.business.wormAuditRecordsTotal ?? 0}
                </span>
                <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                  {telemetry?.business.aiSoapGenerationsTotal ?? 0} SOAP IA
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {telemetry?.business.sessionsCompletedTotal ?? 0} sessões finalizadas
              </p>
            </div>
          </div>

          {/* Trace Explorer (W3C OpenTelemetry Spans) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lista de Spans Recentes */}
            <div className={`p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 ${selectedTrace ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Trace Explorer — Rastreamento Distribuído OpenTelemetry
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Buffer circular em memória com os últimos spans W3C ({telemetryTraces.length} registrados)
                  </p>
                </div>
                <div className="text-[11px] text-slate-400">
                  Clique em um span para inspecionar atributos W3C
                </div>
              </div>

              <div className="space-y-2 pt-2 max-h-[480px] overflow-y-auto pr-1">
                {telemetryTraces.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 text-center">Nenhum span OTel registrado ainda.</p>
                ) : (
                  telemetryTraces.map((span) => {
                    const isSelected = selectedTrace?.spanId === span.spanId;
                    const isOk = span.status === 'OK';
                    return (
                      <div
                        key={span.spanId}
                        onClick={() => setSelectedTrace(span)}
                        className={`p-3.5 rounded-2xl border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 shadow-sm'
                            : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {isOk ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {span.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {span.kind}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {span.durationMs !== undefined ? `${span.durationMs}ms` : 'ativo'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(span.startTimeMs).toLocaleTimeString('pt-BR')}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            <span>Trace: {span.traceId.slice(0, 8)}...{span.traceId.slice(-8)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyTraceId(span.traceId);
                              }}
                              className="p-1 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                              title="Copiar Trace ID W3C"
                            >
                              {copiedTraceId === span.traceId ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <span className={`text-[10px] font-semibold ${isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {span.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Painel de Detalhes do Span Selecionado */}
            {selectedTrace && (
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    Detalhes do Span W3C
                  </h4>
                  <button
                    onClick={() => setSelectedTrace(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Nome da Operação</label>
                    <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{selectedTrace.name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                      <p className={`font-bold mt-0.5 ${selectedTrace.status === 'OK' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {selectedTrace.status}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Duração</label>
                      <p className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedTrace.durationMs ?? 0} ms
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">W3C Trace ID (128-bit)</label>
                      <button
                        onClick={() => handleCopyTraceId(selectedTrace.traceId)}
                        className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTraceId === selectedTrace.traceId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        Copiar
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all bg-slate-50 dark:bg-slate-800 p-2 rounded-xl mt-1 border border-slate-200 dark:border-slate-700">
                      {selectedTrace.traceId}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Span ID (64-bit)</label>
                      <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all bg-slate-50 dark:bg-slate-800 p-1.5 rounded-lg mt-0.5">
                        {selectedTrace.spanId}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Parent Span ID</label>
                      <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all bg-slate-50 dark:bg-slate-800 p-1.5 rounded-lg mt-0.5">
                        {selectedTrace.parentSpanId || 'root'}
                      </p>
                    </div>
                  </div>

                  {/* Atributos do Span */}
                  <div className="pt-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Atributos OTel</label>
                    <div className="mt-1 space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {Object.entries(selectedTrace.attributes).length === 0 ? (
                        <p className="text-slate-400 italic text-[11px]">Nenhum atributo associado.</p>
                      ) : (
                        Object.entries(selectedTrace.attributes).map(([k, v]) => (
                          <div key={k} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 text-[11px] flex items-center justify-between">
                            <span className="font-mono text-slate-500 dark:text-slate-400 font-semibold">{k}</span>
                            <span className="font-mono text-slate-900 dark:text-white truncate max-w-[140px] text-right" title={String(v)}>
                              {String(v)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Eventos do Span */}
                  {selectedTrace.events && selectedTrace.events.length > 0 && (
                    <div className="pt-2">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Eventos do Ciclo de Vida</label>
                      <div className="mt-1 space-y-1">
                        {selectedTrace.events.map((ev, idx) => (
                          <div key={idx} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 text-[11px]">
                            <div className="flex items-center justify-between font-semibold text-teal-600 dark:text-teal-400">
                              <span>{ev.name}</span>
                              <span className="text-[10px] text-slate-400">{new Date(ev.timestampMs).toLocaleTimeString('pt-BR')}</span>
                            </div>
                            {ev.attributes && (
                              <pre className="text-[10px] font-mono text-slate-500 mt-1 whitespace-pre-wrap">
                                {JSON.stringify(ev.attributes, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Exportador Automático OpenTelemetry OTLP / Coletores Remotos */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            {/* Topo do Card OTLP */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Exportador Automático OpenTelemetry OTLP (Coletores Remotos)
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                      otlpStats?.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : otlpStats?.status === 'PAUSED'
                        ? 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20'
                        : otlpStats?.status === 'DEGRADED'
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        otlpStats?.status === 'ACTIVE'
                          ? 'bg-emerald-500 animate-pulse'
                          : otlpStats?.status === 'PAUSED'
                          ? 'bg-slate-400'
                          : otlpStats?.status === 'DEGRADED'
                          ? 'bg-amber-500 animate-ping'
                          : 'bg-rose-500'
                      }`} />
                      {otlpStats?.status === 'ACTIVE' ? 'Coletor Conectado & Exportando' :
                       otlpStats?.status === 'PAUSED' ? 'Exportação Pausada' :
                       otlpStats?.status === 'DEGRADED' ? 'Degradado / Em Retries' : 'Falha de Conexão'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>Destino: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{otlpConfig?.provider || 'GENERIC_COLLECTOR'}</strong></span>
                    <span>•</span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">{otlpConfig?.endpoint || 'http://localhost:4318'}</span>
                    <span>•</span>
                    <span>Lote máx: {otlpConfig?.batchSize || 20} spans</span>
                    <span>•</span>
                    <span>Auto-flush: {otlpConfig?.flushIntervalSeconds || 10}s</span>
                  </p>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleTestOtlp}
                  disabled={testingOtlp}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Testar envio sintético para o coletor OTLP configurado"
                >
                  <Play className={`w-3.5 h-3.5 text-teal-600 dark:text-teal-400 ${testingOtlp ? 'animate-spin' : ''}`} />
                  <span>{testingOtlp ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                <button
                  onClick={handleFlushOtlp}
                  disabled={flushingOtlp || (otlpStats?.queuedSpansCount ?? 0) === 0}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  title="Forçar envio imediato dos spans acumulados no buffer"
                >
                  <Send className={`w-3.5 h-3.5 ${flushingOtlp ? 'animate-pulse' : ''}`} />
                  <span>{flushingOtlp ? 'Despachando...' : 'Forçar Flush OTLP'}</span>
                </button>

                <button
                  onClick={handleOpenConfigModal}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Configurar</span>
                </button>
              </div>
            </div>

            {/* Feedback / Alerta */}
            {otlpFeedback && (
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>{otlpFeedback}</span>
              </div>
            )}

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div className={`p-4 rounded-2xl border text-xs space-y-1.5 animate-fade-in ${
                testResult.success
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    )}
                    <span className={testResult.success ? 'text-emerald-900 dark:text-emerald-200' : 'text-rose-900 dark:text-rose-200'}>
                      {testResult.success ? 'Conexão OTLP Validada com Sucesso!' : 'Falha na Validação do Coletor OTLP'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    Latência: {testResult.durationMs}ms {testResult.statusCode ? `• HTTP ${testResult.statusCode}` : ''}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                  Endpoint testado: {testResult.endpoint}
                </p>
                {testResult.error && (
                  <p className="text-rose-700 dark:text-rose-300 font-medium">
                    Erro reportado: {testResult.error}
                  </p>
                )}
              </div>
            )}

            {/* Grade de 4 KPIs OTLP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Spans em Buffer (Fila)</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {otlpStats?.queuedSpansCount ?? 0}
                  </span>
                  <span className="text-xs text-slate-500">/ {otlpConfig?.batchSize || 20} para auto-flush</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Acumulados em memória RAM</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Exportado</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {otlpStats?.totalExportedSpans ?? 0}
                  </span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                    em {otlpStats?.totalExportedBatches ?? 0} lotes
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Spans enviados com sucesso</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Taxa de Sucesso OTLP</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {otlpStats?.successRate ?? 100}%
                  </span>
                  {otlpStats && otlpStats.failedBatchesCount > 0 && (
                    <span className="text-xs text-rose-500 font-medium">({otlpStats.failedBatchesCount} falhas)</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Confiabilidade de entrega</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Último Envio / Latência</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                    {otlpStats?.lastLatencyMs !== undefined ? `${otlpStats.lastLatencyMs}ms` : '—'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 truncate">
                  {otlpStats?.lastExportAt ? new Date(otlpStats.lastExportAt).toLocaleTimeString('pt-BR') : 'Nenhum envio recente'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração do Coletor OTLP */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Configuração do Exportador OTLP
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina o coletor remoto para traces e métricas (RFC-001 §5.2)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Toggle Habilitado */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Habilitar Exportação OTLP</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">Ativa o envio em lote periódico de spans para o coletor</p>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Seletor de Provedor */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Provedor / Destino OTLP
                </label>
                <select
                  value={configForm.provider}
                  onChange={(e) => {
                    const prov = e.target.value as OtlpExporterProvider;
                    let defaultEndpoint = configForm.endpoint;
                    if (prov === OtlpExporterProvider.DATADOG) defaultEndpoint = 'https://otlp.datadoghq.com';
                    else if (prov === OtlpExporterProvider.NEW_RELIC) defaultEndpoint = 'https://otlp.nr-data.net:4318';
                    else if (prov === OtlpExporterProvider.DYNATRACE) defaultEndpoint = 'https://live.dynatrace.com/api/v2/otlp';
                    else if (prov === OtlpExporterProvider.GENERIC_COLLECTOR) defaultEndpoint = 'http://localhost:4318';

                    setConfigForm({
                      ...configForm,
                      provider: prov,
                      endpoint: defaultEndpoint
                    });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                >
                  <option value={OtlpExporterProvider.GENERIC_COLLECTOR}>OpenTelemetry Collector Padrão (localhost:4318)</option>
                  <option value={OtlpExporterProvider.DATADOG}>Datadog OTLP Intake (otlp.datadoghq.com)</option>
                  <option value={OtlpExporterProvider.NEW_RELIC}>New Relic OTLP Intake (otlp.nr-data.net:4318)</option>
                  <option value={OtlpExporterProvider.DYNATRACE}>Dynatrace OTLP HTTP Endpoint</option>
                  <option value={OtlpExporterProvider.CUSTOM}>Endpoint OTLP Personalizado</option>
                </select>
              </div>

              {/* Endpoint URL */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Endpoint URL (HTTP/HTTPS)
                </label>
                <input
                  type="text"
                  value={configForm.endpoint}
                  onChange={(e) => setConfigForm({ ...configForm, endpoint: e.target.value })}
                  placeholder="https://otlp.datadoghq.com"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
              </div>

              {/* Chave de API / Token */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Chave de API / Autenticação (opcional)
                </label>
                <input
                  type="password"
                  value={configForm.apiKey}
                  onChange={(e) => setConfigForm({ ...configForm, apiKey: e.target.value })}
                  placeholder="Deixe em branco para manter a atual ou insira nova chave"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Datadog: dd-api-key • New Relic: api-key • Dynatrace: Api-Token • Genérico: Bearer
                </span>
              </div>

              {/* Parâmetros de Lote e Flush */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Tamanho do Lote (Spans)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={configForm.batchSize}
                    onChange={(e) => setConfigForm({ ...configForm, batchSize: Number(e.target.value) || 20 })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Intervalo de Flush (s)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={configForm.flushIntervalSeconds}
                    onChange={(e) => setConfigForm({ ...configForm, flushIntervalSeconds: Number(e.target.value) || 10 })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Checkboxes de exportação */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configForm.exportTraces}
                    onChange={(e) => setConfigForm({ ...configForm, exportTraces: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px]">Exportar Spans (Traces)</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configForm.exportMetrics}
                    onChange={(e) => setConfigForm({ ...configForm, exportMetrics: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300 text-[11px]">Exportar Métricas OTLP</span>
                </label>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? 'Salvando...' : 'Salvar Configuração (WORM)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prévia do Payload Prometheus (/metrics) */}
      {showPrometheusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-950 border border-slate-800 text-slate-100 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Coletor de Métricas Prometheus
                    <span className="text-xs font-normal text-slate-400 font-mono">GET /metrics</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Formato OpenMetrics v0.0.4 compatível com Prometheus, VictoriaMetrics e Grafana Agent
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPrometheusModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto font-mono text-xs text-slate-300 bg-slate-950 space-y-1">
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {rawPrometheus || '# Carregando métricas Prometheus...'}
              </pre>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-teal-400" />
                Content-Type: text/plain; version=0.0.4; charset=utf-8
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyPrometheus}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  {copiedPrometheus ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Métricas</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPrometheusModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
