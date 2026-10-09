import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertCircle, Database, FileText } from 'lucide-react';
import type { AuditLog } from '@terapiainfoco/shared';
import { api } from '../services/api';

export function AuditModule() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar trilha de auditoria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            Trilha de Auditoria Imutável (WORM)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Registro Write-Once-Read-Many inviolável de todos os acessos e descriptografias (RFC §4.4 & LGPD)
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors self-start sm:self-auto"
          title="Atualizar Logs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cards explicativos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium">Política WORM</span>
            <p className="text-sm font-semibold text-white">Append-Only Imutável</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium">Total de Registros de Auditoria</span>
            <p className="text-sm font-semibold text-white">{logs.length} eventos registrados</p>
          </div>
        </div>
      </div>

      {/* Tabela de Logs */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Eventos Auditados em Tempo Real
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Carregando trilha de auditoria...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">Nenhum evento registrado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3.5 font-medium">Data / Hora</th>
                  <th className="p-3.5 font-medium">Ação</th>
                  <th className="p-3.5 font-medium">Recurso</th>
                  <th className="p-3.5 font-medium">ID do Recurso</th>
                  <th className="p-3.5 font-medium">IP de Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 text-slate-300">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.action === 'CREATE'
                          ? 'bg-teal-500/15 text-teal-300 border border-teal-500/20'
                          : log.action === 'DECRYPT_READ'
                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                          : log.action === 'SIGN_RECORD'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-300">{log.resourceType}</td>
                    <td className="p-3.5 text-slate-400 truncate max-w-[150px]">{log.resourceId}</td>
                    <td className="p-3.5 text-slate-400">{log.ipAddress}</td>
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
