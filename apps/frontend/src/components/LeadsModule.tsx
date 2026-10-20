import { useEffect, useState } from 'react';
import { Inbox, RefreshCw, AlertCircle } from 'lucide-react';
import type { AdminLead } from '@terapiainfoco/shared';
import { api } from '../services/api';

const PRACTICE_LABELS: Record<string, string> = {
  autonomo: 'Consultório particular',
  clinica: 'Clínica / espaço compartilhado',
  hibrido: 'Online e presencial'
};

/** Pedidos de acesso antecipado enviados pelo formulário da landing page (Admin) */
export function LeadsModule() {
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setLeads(await api.listLeads());
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar os pedidos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Inbox className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Pedidos de Acesso
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Psicólogos que pediram acesso pela landing page
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="self-start p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-2.5 pr-4">Nome</th>
              <th className="py-2.5 pr-4">Contato</th>
              <th className="py-2.5 pr-4">CRP</th>
              <th className="py-2.5 pr-4">Atuação</th>
              <th className="py-2.5 text-right">Recebido em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">{lead.name}</td>
                <td className="py-3 pr-4">
                  <a href={`mailto:${lead.email}`} className="text-teal-700 dark:text-teal-300 hover:underline block">{lead.email}</a>
                  {lead.whatsapp && <span className="text-[11px] text-slate-500 dark:text-slate-400">{lead.whatsapp}</span>}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{lead.crp}</td>
                <td className="py-3 pr-4">{PRACTICE_LABELS[lead.practiceType] ?? lead.practiceType}</td>
                <td className="py-3 text-right whitespace-nowrap">{new Date(lead.createdAt).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {leads.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500 dark:text-slate-400">Nenhum pedido recebido.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
