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
  Filter
} from 'lucide-react';
import { AuditAction, AuditResourceType, type AuditLog, type ChainIntegrityResult, type AuditFilterParams } from '@terapiainfoco/shared';
import { api } from '../services/api';

export function AuditModule() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<ChainIntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500"
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
          className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500"
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
  );
}
