import { useEffect, useState } from 'react';
import { BadgeCheck, XCircle, ExternalLink, Loader2, Inbox } from 'lucide-react';
import type { TherapistOwnProfile } from '@terapiainfoco/shared';
import { api } from '../services/api';

/**
 * Fila de verificação de CRP (Admin/DPO). A conferência é manual no Cadastro Nacional
 * de Psicólogos do CFP; só perfis aprovados aparecem na busca pública.
 */
export function CrpVerificationModule() {
  const [pending, setPending] = useState<TherapistOwnProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPending(await api.listPendingCrpVerifications());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (therapistId: string, approved: boolean) => {
    setBusyId(therapistId);
    setError(null);
    try {
      await api.verifyTherapistCrp(therapistId, approved);
      setPending((prev) => prev.filter((p) => p.therapistId !== therapistId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Verificação de CRP</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Confira cada registro no{' '}
          <a href="https://cadastro.cfp.org.br/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 underline">
            Cadastro Nacional de Psicólogos (CFP) <ExternalLink className="w-3 h-3" />
          </a>{' '}
          antes de aprovar. Reprovar despublica o perfil até o psicólogo corrigir e publicar novamente.
        </p>
      </div>

      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando fila...</p>
      ) : pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <Inbox className="w-8 h-8 mx-auto text-slate-400" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhum perfil aguardando verificação.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Psicólogo(a)</th>
                <th className="px-4 py-3">CRP</th>
                <th className="px-4 py-3">Abordagens</th>
                <th className="px-4 py-3 text-right">Decisão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
              {pending.map((p) => (
                <tr key={p.therapistId}>
                  <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{p.displayName}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-mono">{p.crp} ({p.crpRegion})</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.approaches.join(', ') || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => decide(p.therapistId, true)}
                        disabled={busyId === p.therapistId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                      >
                        <BadgeCheck className="w-3.5 h-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => decide(p.therapistId, false)}
                        disabled={busyId === p.therapistId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-60"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reprovar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
