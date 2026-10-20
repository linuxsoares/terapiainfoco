import { useEffect, useState } from 'react';
import { Inbox, RefreshCw, AlertCircle, Check, Copy, X, MessageCircle, Mail } from 'lucide-react';
import type { AdminLead, LeadStatus } from '@terapiainfoco/shared';
import { api } from '../services/api';

const PRACTICE_LABELS: Record<string, string> = {
  autonomo: 'Consultório particular',
  clinica: 'Clínica / espaço compartilhado',
  hibrido: 'Online e presencial'
};

const STATUS_STYLES: Record<LeadStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60' },
  APPROVED: { label: 'Aprovado', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60' },
  REJECTED: { label: 'Recusado', className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' }
};

// Número do conselho regional → UF (regiões de um só estado); nos demais o Admin informa
const CRP_REGION_UF: Record<string, string> = {
  '01': 'DF', '02': 'PE', '03': 'BA', '04': 'MG', '05': 'RJ', '06': 'SP', '07': 'RS', '08': 'PR',
  '09': 'GO', '10': 'PA', '11': 'CE', '12': 'SC', '13': 'PB', '14': 'MS', '15': 'AL', '16': 'ES'
};

function guessUf(crp: string): string {
  const prefix = crp.trim().match(/^(\d{1,2})\s*\//)?.[1]?.padStart(2, '0');
  return (prefix && CRP_REGION_UF[prefix]) || '';
}

/** Link do WhatsApp com DDI do Brasil quando o número vem só com DDD */
function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function accessMessage(lead: AdminLead): string {
  return `Olá, ${lead.name.split(' ')[0]}! Seu acesso ao TerapiaInFoco foi aprovado. ` +
    `Entre em ${window.location.origin} com o e-mail ${lead.email}. ` +
    'Envio a senha inicial em uma mensagem separada; no primeiro acesso você define uma senha pessoal.';
}

/** Pedidos de acesso antecipado enviados pelo formulário da landing page (Admin) */
export function LeadsModule() {
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ lead: AdminLead; uf: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ lead: AdminLead; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const replaceLead = (updated: AdminLead) => setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));

  const approve = async () => {
    if (!approving) return;
    try {
      setBusyId(approving.lead.id);
      setError(null);
      const res = await api.approveLead(approving.lead.id, approving.uf);
      replaceLead(res.lead);
      setIssued({ lead: res.lead, temporaryPassword: res.temporaryPassword });
      setCopied(false);
      setApproving(null);
    } catch (err: any) {
      setError(err.message || 'Não foi possível aprovar o pedido.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (lead: AdminLead) => {
    if (!window.confirm(`Recusar o pedido de ${lead.name}? Nenhuma conta será criada.`)) return;
    try {
      setBusyId(lead.id);
      setError(null);
      replaceLead(await api.rejectLead(lead.id));
    } catch (err: any) {
      setError(err.message || 'Não foi possível recusar o pedido.');
    } finally {
      setBusyId(null);
    }
  };

  const copyPassword = () => {
    if (!issued) return;
    navigator.clipboard.writeText(issued.temporaryPassword);
    setCopied(true);
  };

  const pendingCount = leads.filter((l) => l.status === 'PENDING').length;

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
            {pendingCount > 0 && ` · ${pendingCount} aguardando análise`}
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

      {approving && (
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/60 shadow-sm space-y-3">
          <p className="text-sm text-slate-800 dark:text-slate-200">
            Aprovar <strong>{approving.lead.name}</strong> cria uma conta de psicólogo com o e-mail {approving.lead.email} e o
            CRP {approving.lead.crp}. Quando a pessoa publicar o perfil, o CRP passa pela Verificação de CRP antes de aparecer na vitrine.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              UF do CRP
              <input
                value={approving.uf}
                onChange={(e) => setApproving({ ...approving, uf: e.target.value.toUpperCase().slice(0, 2) })}
                maxLength={2}
                placeholder="SP"
                className="block mt-1 w-20 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <button
              onClick={approve}
              disabled={busyId === approving.lead.id || approving.uf.length !== 2}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {busyId === approving.lead.id ? 'Criando conta...' : 'Criar conta e aprovar'}
            </button>
            <button
              onClick={() => setApproving(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {issued && (
        <div className="p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-slate-800 dark:text-slate-200">
              Conta de <strong>{issued.lead.name}</strong> criada. Entregue a senha inicial por um canal seguro: ela não será
              exibida de novo. No primeiro acesso a pessoa define uma senha pessoal.
            </p>
            <button onClick={() => setIssued(null)} className="p-1 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 font-mono text-sm text-slate-900 dark:text-white select-all">
              {issued.temporaryPassword}
            </code>
            <button
              type="button"
              onClick={copyPassword}
              className="p-2 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
              title="Copiar senha"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            {issued.lead.whatsapp && whatsappLink(issued.lead.whatsapp, accessMessage(issued.lead)) && (
              <a
                href={whatsappLink(issued.lead.whatsapp, accessMessage(issued.lead))!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Avisar no WhatsApp
              </a>
            )}
            <a
              href={`mailto:${issued.lead.email}?subject=${encodeURIComponent('Seu acesso ao TerapiaInFoco')}&body=${encodeURIComponent(accessMessage(issued.lead))}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <Mail className="w-3.5 h-3.5" /> Avisar por e-mail
            </a>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            A mensagem de aviso não contém a senha: envie-a separadamente.
          </p>
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
              <th className="py-2.5 pr-4">Recebido em</th>
              <th className="py-2.5 pr-4">Situação</th>
              <th className="py-2.5 text-right">Ações</th>
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
                <td className="py-3 pr-4 whitespace-nowrap">{new Date(lead.createdAt).toLocaleString('pt-BR')}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[lead.status].className}`}>
                    {STATUS_STYLES[lead.status].label}
                  </span>
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  {lead.status === 'PENDING' ? (
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => {
                          setApproving({ lead, uf: guessUf(lead.crp) });
                          setIssued(null);
                        }}
                        disabled={busyId === lead.id}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => reject(lead)}
                        disabled={busyId === lead.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lead.handledAt ? new Date(lead.handledAt).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {leads.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-500 dark:text-slate-400">Nenhum pedido recebido.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
