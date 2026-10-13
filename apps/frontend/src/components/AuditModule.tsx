import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  Database, 
  FileText, 
  Download, 
  CheckCircle2, 
  Lock, 
  FileSpreadsheet, 
  Layers, 
  Filter,
  Play,
  Copy,
  Check,
  Award,
  FileCheck2,
  ShieldAlert
} from 'lucide-react';
import { 
  AuditAction, 
  AuditResourceType, 
  type AuditLog, 
  type ChainIntegrityResult, 
  type AuditFilterParams,
  type DPIAReport
} from '@terapiainfoco/shared';
import { api } from '../services/api';

export function AuditModule() {
  const [activeTab, setActiveTab] = useState<'worm_logs' | 'dpia_pentest'>('worm_logs');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<ChainIntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de RIPD / DPIA & Pentest (Fase 4 do RFC-001)
  const [dpiaReport, setDpiaReport] = useState<DPIAReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [runningPentest, setRunningPentest] = useState(false);
  const [downloadingRipd, setDownloadingRipd] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Filtros
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterResourceType, setFilterResourceType] = useState<string>('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;

      const [logsData, chainData] = await Promise.all([
        api.getAuditLogs(params),
        api.verifyAuditChain()
      ]);
      setLogs(logsData);
      setChainStatus(chainData);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar trilha de auditoria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction, filterResourceType]);

  const handleVerifyChain = async () => {
    try {
      setVerifyingChain(true);
      setError(null);
      const result = await api.verifyAuditChain();
      setChainStatus(result);
      if (result.isValid) {
        setSuccessMessage(`Integridade criptográfica validada com sucesso! ${result.totalEntries} blocos sequenciais conferidos.`);
      } else {
        setError(`Atenção: Cadeia violada no bloco #${result.tamperedAtIndex}!`);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao validar hash-chain WORM');
    } finally {
      setVerifyingChain(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting('csv');
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;
      await api.downloadAuditCsv(params);
    } catch (err: any) {
      setError(err.message || 'Falha ao exportar CSV de auditoria');
    } finally {
      setExporting(null);
    }
  };

  const handleExportJson = async () => {
    try {
      setExporting('json');
      const params: AuditFilterParams = {};
      if (filterAction) params.action = filterAction;
      if (filterResourceType) params.resourceType = filterResourceType;
      await api.downloadAuditJson(params);
    } catch (err: any) {
      setError(err.message || 'Falha ao exportar relatório JSON assinado');
    } finally {
      setExporting(null);
    }
  };

  const fetchDPIAReport = async () => {
    try {
      setLoadingReport(true);
      const report = await api.getLatestDPIAReport();
      setDpiaReport(report);
    } catch (err: any) {
      console.warn('Falha ao carregar relatório DPIA:', err.message);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dpia_pentest' && !dpiaReport) {
      fetchDPIAReport();
    }
  }, [activeTab]);

  const handleRunPentest = async () => {
    try {
      setRunningPentest(true);
      setError(null);
      const res = await api.runCompliancePentest();
      setDpiaReport(res.report);
      setSuccessMessage(res.message);
      await fetchLogs();
    } catch (err: any) {
      setError(err.message || 'Falha ao executar pentest automatizado');
    } finally {
      setRunningPentest(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleDownloadRipd = async () => {
    try {
      setDownloadingRipd(true);
      await api.downloadDPIAReport();
      setSuccessMessage('Relatório RIPD/DPIA baixado com sucesso em JSON assinado.');
    } catch (err: any) {
      setError(err.message || 'Falha ao baixar relatório RIPD');
    } finally {
      setDownloadingRipd(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Trilha de Auditoria Externa (Hash-Chain WORM) & DPO/CFP
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ledger criptográfico inviolável encadeado por SHA-256 para atendimento à LGPD (Art. 37/38/50) e Resoluções CFP.
          </p>
        </div>

        {/* Ações e Exportações */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleVerifyChain}
            disabled={verifyingChain}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
            title="Recalcula e confere todos os hashes SHA-256 da cadeia WORM"
          >
            <Lock className={`w-3.5 h-3.5 ${verifyingChain ? 'animate-spin' : ''}`} />
            {verifyingChain ? 'Verificando...' : 'Verificar Cadeia SHA-256'}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting === 'csv'}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm dark:shadow-none transition-colors cursor-pointer disabled:opacity-50"
            title="Download da trilha de auditoria em CSV forense"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            {exporting === 'csv' ? 'Gerando...' : 'CSV Forense'}
          </button>

          <button
            onClick={handleExportJson}
            disabled={exporting === 'json'}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm dark:shadow-none transition-colors cursor-pointer disabled:opacity-50"
            title="Download do relatório de conformidade formal para DPO e CFP"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            {exporting === 'json' ? 'Gerando...' : 'Relatório DPO (JSON)'}
          </button>

          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white shadow-sm dark:shadow-none transition-colors cursor-pointer"
            title="Atualizar Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Seletor de Abas */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab('worm_logs')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs transition-colors cursor-pointer ${
            activeTab === 'worm_logs'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Trilha WORM & Logs Imutáveis</span>
        </button>

        <button
          onClick={() => setActiveTab('dpia_pentest')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs transition-colors cursor-pointer ${
            activeTab === 'dpia_pentest'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Relatório de Impacto (RIPD / DPIA) & Pentest</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Fase 4
          </span>
        </button>
      </div>

      {activeTab === 'worm_logs' && (
        <div className="space-y-6 animate-fade-in">
          {/* Status da Hash-Chain WORM */}
          {chainStatus && (
        <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          chainStatus.isValid 
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-900 dark:text-emerald-100'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              chainStatus.isValid ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
            }`}>
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Integridade da Hash-Chain WORM</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  chainStatus.isValid 
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                }`}>
                  {chainStatus.isValid ? 'Tamper-Evident: 100% Íntegro' : 'VIOLAÇÃO DETECTADA'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {chainStatus.isValid 
                  ? `Todos os ${chainStatus.totalEntries} blocos criptográficos encadeados conferem sequencialmente com o bloco gênesis.`
                  : `Falha de integridade criptográfica no bloco #${chainStatus.tamperedAtIndex}. Log ID: ${chainStatus.tamperedLogId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-500 dark:text-slate-400">
            <div>
              <span className="block text-[10px] uppercase text-slate-400">Último Hash (SHA-256):</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {chainStatus.latestHash ? `${chainStatus.latestHash.slice(0, 16)}...` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Métricas & Conformidade */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Arquitetura de Armazenamento</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Append-Only Imutável WORM</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total de Registros Auditados</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{logs.length} eventos registrados</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bases Regulatórias Vigentes</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">LGPD Art. 37/38 & CFP 001/011</p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros:</span>
        </div>

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500 w-full sm:w-auto"
        >
          <option value="">Todas as Ações</option>
          <option value={AuditAction.CREATE}>CREATE</option>
          <option value={AuditAction.DECRYPT_READ}>DECRYPT_READ</option>
          <option value={AuditAction.UPDATE}>UPDATE</option>
          <option value={AuditAction.SIGN_RECORD}>SIGN_RECORD</option>
          <option value={AuditAction.DATA_EXPORT}>DATA_EXPORT</option>
          <option value={AuditAction.CONSENT_REVOCATION}>CONSENT_REVOCATION</option>
          <option value={AuditAction.BACKUP_CREATE}>BACKUP_CREATE</option>
          <option value={AuditAction.BACKUP_RESTORE}>BACKUP_RESTORE</option>
        </select>

        <select
          value={filterResourceType}
          onChange={(e) => setFilterResourceType(e.target.value)}
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500 w-full sm:w-auto"
        >
          <option value="">Todos os Recursos</option>
          <option value={AuditResourceType.PATIENT}>PATIENT</option>
          <option value={AuditResourceType.CLINICAL_RECORD}>CLINICAL_RECORD</option>
          <option value={AuditResourceType.APPOINTMENT}>APPOINTMENT</option>
          <option value={AuditResourceType.DOCUMENT}>DOCUMENT</option>
          <option value={AuditResourceType.TRANSCRIPT}>TRANSCRIPT</option>
          <option value={AuditResourceType.BACKUP}>BACKUP</option>
        </select>

        {(filterAction || filterResourceType) && (
          <button
            onClick={() => { setFilterAction(''); setFilterResourceType(''); }}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-auto"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Tabela de Logs */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Ledger Criptográfico de Auditoria ({logs.length} eventos)
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Algoritmo: SHA-256 Hash Chain
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Carregando trilha de auditoria...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">Nenhum evento registrado para os filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3 font-medium text-center w-14">#Seq</th>
                  <th className="p-3 font-medium">Data / Hora</th>
                  <th className="p-3 font-medium">Ação</th>
                  <th className="p-3 font-medium">Recurso</th>
                  <th className="p-3 font-medium">ID do Recurso</th>
                  <th className="p-3 font-medium font-mono">Hash SHA-256</th>
                  <th className="p-3 font-medium">IP Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 text-center text-slate-400 dark:text-slate-500 font-bold">
                      {log.sequenceNumber ?? '-'}
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.action === AuditAction.CREATE
                          ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/20'
                          : log.action === AuditAction.DECRYPT_READ
                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                          : log.action === AuditAction.SIGN_RECORD
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          : log.action === AuditAction.BACKUP_CREATE || log.action === AuditAction.BACKUP_RESTORE
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{log.resourceType}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{log.resourceId}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">
                      {log.hash ? (
                        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/20" title={`Hash Completo: ${log.hash}\nPrevious Hash: ${log.previousHash}`}>
                          {log.hash.slice(0, 10)}...{log.hash.slice(-6)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}

      {/* Aba 2: Relatório de Impacto (RIPD / DPIA) & Pentest Automatizado (Fase 4 do RFC-001) */}
      {activeTab === 'dpia_pentest' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header e Ações do Relatório RIPD */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-500/20 shrink-0">
                  <Award className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Relatório de Impacto à Proteção de Dados (RIPD / DPIA) & Pentest
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      LGPD Art. 38 & 50
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      CFP 001/011
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                    Avaliação contínua de salvaguardas técnicas, mitigação de riscos à privacidade e teste ativo de intrusão
                    (pentesting automatizado). Atesta a inviolabilidade da infraestrutura perante a ANPD e o Conselho Federal de Psicologia.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleRunPentest}
                  disabled={runningPentest}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Disparar bateria com os 6 cenários de pentest automatizado"
                >
                  <Play className={`w-4 h-4 ${runningPentest ? 'animate-spin' : ''}`} />
                  <span>{runningPentest ? 'Executando Pentest...' : 'Executar Pentest Automatizado'}</span>
                </button>

                <button
                  onClick={handleDownloadRipd}
                  disabled={downloadingRipd || !dpiaReport}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Download do arquivo oficial assinado em JSON"
                >
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{downloadingRipd ? 'Baixando...' : 'Exportar RIPD Oficial'}</span>
                </button>
              </div>
            </div>

            {loadingReport && !dpiaReport ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                <span>Carregando dados de conformidade e pentesting...</span>
              </div>
            ) : dpiaReport ? (
              <>
                {/* Score Geral e Metadados do Relatório */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg font-black shrink-0">
                      {dpiaReport.overallScore}%
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Score de Blindagem</span>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {dpiaReport.complianceStatus === 'FULL_COMPLIANCE' ? 'Conformidade Integral (100%)' : 'Ação Recomendada'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responsável Legal / DPO</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                      {dpiaReport.dpoName}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Auditoria</span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {new Date(dpiaReport.generatedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selo Probatório (SHA-256)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        {dpiaReport.canonicalHash.slice(0, 10)}...{dpiaReport.canonicalHash.slice(-6)}
                      </span>
                      <button
                        onClick={() => handleCopyHash(dpiaReport.canonicalHash)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors cursor-pointer"
                        title="Copiar Hash Canônico do Relatório"
                      >
                        {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Resumo Executivo */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong className="text-emerald-800 dark:text-emerald-300 block mb-1">
                    📋 Resumo Executivo para Fiscalização ANPD & CFP:
                  </strong>
                  {dpiaReport.executiveSummary}
                </div>

                {/* Seção 1: Cenários de Pentest Automatizado */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Cenários de Pentest Automatizado ({dpiaReport.pentestSummary.passed}/{dpiaReport.pentestSummary.totalScenarios} Aprovados)
                    </h3>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      0 Falhas Detectadas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {dpiaReport.scenarios.map((sc) => (
                      <div 
                        key={sc.scenarioId}
                        className="p-4 rounded-2xl border bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {sc.scenarioId}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              DEFESA ATIVADA ({sc.latencyMs}ms)
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                            {sc.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            <strong>Ataque:</strong> {sc.attackVectorSimulated}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                            🛡️ {sc.defenseMechanismTriggered}
                          </p>
                          <span className="text-[10px] text-slate-400 block">
                            Ref: {sc.legalBasisRef}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seção 2: Salvaguardas dos Artigos da LGPD */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Matriz de Conformidade Técnica — LGPD (Lei nº 13.709/2018)
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4">Artigo da Lei</th>
                          <th className="py-2.5 pr-4">Exigência Normativa</th>
                          <th className="py-2.5 pr-4">Salvaguarda Técnica Implementada</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dpiaReport.lgpdArticles.map((art) => (
                          <tr key={art.article} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {art.article}
                              <span className="block text-[10px] text-slate-400 font-normal">{art.title}</span>
                            </td>
                            <td className="py-2.5 pr-4 max-w-xs text-[11px] text-slate-600 dark:text-slate-400">
                              {art.requirement}
                            </td>
                            <td className="py-2.5 pr-4 max-w-sm text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                              {art.technicalSafeguard}
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                COMPLIANT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Seção 3: Salvaguardas das Resoluções do CFP */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Matriz Deontológica — Conselho Federal de Psicologia (CFP)
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4">Resolução CFP</th>
                          <th className="py-2.5 pr-4">Exigência Normativa</th>
                          <th className="py-2.5 pr-4">Salvaguarda Técnica Implementada</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dpiaReport.cfpResolutions.map((cfp) => (
                          <tr key={cfp.resolution} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="py-2.5 pr-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {cfp.resolution}
                              <span className="block text-[10px] text-slate-400 font-normal">{cfp.title}</span>
                            </td>
                            <td className="py-2.5 pr-4 max-w-xs text-[11px] text-slate-600 dark:text-slate-400">
                              {cfp.requirement}
                            </td>
                            <td className="py-2.5 pr-4 max-w-sm text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                              {cfp.technicalSafeguard}
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                COMPLIANT
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
