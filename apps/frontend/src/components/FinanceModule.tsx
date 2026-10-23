import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, CheckCircle2, AlertCircle, CircleDollarSign, HelpCircle } from 'lucide-react';
import { AppointmentStatus, type FinanceSessionItem, type FinanceSummaryResponse } from '@terapiainfoco/shared';
import { api } from '../services/api';
import { SessionPaymentModal, PAYMENT_METHOD_LABELS, formatBrl, type PayableSession } from './SessionPaymentModal';

const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const formatDay = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const formatPaidAt = (ymd?: string) => (ymd ? ymd.split('-').reverse().join('/') : '');

/** Financeiro do consultório: contas a receber e pagamentos recebidos no mês */
export function FinanceModule() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<FinanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getFinanceSummary(month));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar o financeiro.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  // Contas a receber agrupadas por paciente, maior saldo primeiro
  const byPatient = useMemo(() => {
    const groups = new Map<string, { patientName: string; items: FinanceSessionItem[]; totalCents: number }>();
    for (const item of data?.receivable ?? []) {
      const group = groups.get(item.patientId) ?? { patientName: item.patientName, items: [], totalCents: 0 };
      group.items.push(item);
      group.totalCents += item.feeCents ?? 0;
      groups.set(item.patientId, group);
    }
    return [...groups.values()].sort((a, b) => b.totalCents - a.totalCents);
  }, [data]);

  const openPayment = (item: FinanceSessionItem) =>
    setPaying({ id: item.appointmentId, patientName: item.patientName, scheduledStart: item.scheduledStart, feeCents: item.feeCents, paymentStatus: item.paymentStatus });

  const card = 'p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Financeiro
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Sessões a receber e pagamentos recebidos. Faltas sem aviso entram como cobráveis; isente quando não for cobrar.</p>
        </div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
          Mês dos recebimentos
          <input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" />
        </label>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={card}>
            <p className="text-xs text-slate-500 dark:text-slate-400">A receber (todas as sessões em aberto)</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatBrl(data.totals.receivableCents)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{data.receivable.length} sessão(ões)</p>
          </div>
          <div className={card}>
            <p className="text-xs text-slate-500 dark:text-slate-400">Recebido no mês</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatBrl(data.totals.paidCents)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{data.paid.length} pagamento(s)</p>
          </div>
          <div className={card}>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><HelpCircle className="w-3 h-3" /> Sessões sem valor definido</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.totals.receivableWithoutFee}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Defina o valor ao registrar o pagamento</p>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Carregando...</p>}

      {data && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Contas a receber</h3>
          {byPatient.length === 0 ? (
            <p className={`${card} text-sm text-slate-500 dark:text-slate-400`}>Nenhuma sessão em aberto.</p>
          ) : byPatient.map((group) => (
            <div key={group.items[0].patientId} className={`${card} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">{group.patientName}</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatBrl(group.totalCents)}</span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item) => (
                  <li key={item.appointmentId} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {formatDay(item.scheduledStart)}
                      {item.appointmentStatus === AppointmentStatus.NAO_COMPARECEU && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">Falta</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-slate-900 dark:text-white">{item.feeCents ? formatBrl(item.feeCents) : 'sem valor'}</span>
                      <button onClick={() => openPayment(item)} className="px-3 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer">
                        Registrar pagamento
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {data && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Recebidos em {month.split('-').reverse().join('/')}
          </h3>
          {data.paid.length === 0 ? (
            <p className={`${card} text-sm text-slate-500 dark:text-slate-400`}>Nenhum pagamento registrado neste mês.</p>
          ) : (
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3">Pago em</th>
                    <th className="py-2 pr-3">Paciente</th>
                    <th className="py-2 pr-3">Sessão</th>
                    <th className="py-2 pr-3">Forma</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.paid.map((item) => (
                    <tr key={item.appointmentId} className="text-slate-700 dark:text-slate-300">
                      <td className="py-2 pr-3">{formatPaidAt(item.paidAt)}</td>
                      <td className="py-2 pr-3">
                        {item.patientName}
                        {item.payerName && <span className="block text-xs text-slate-500 dark:text-slate-400">pago por {item.payerName}</span>}
                      </td>
                      <td className="py-2 pr-3">{formatDay(item.scheduledStart)}</td>
                      <td className="py-2 pr-3">{item.paymentMethod ? PAYMENT_METHOD_LABELS[item.paymentMethod] : ''}</td>
                      <td className="py-2 pr-3 text-right font-semibold text-slate-900 dark:text-white">{item.feeCents ? formatBrl(item.feeCents) : ''}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => openPayment(item)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">Desfazer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {paying && (
        <SessionPaymentModal
          session={paying}
          onClose={() => setPaying(null)}
          onSaved={(message) => {
            setPaying(null);
            setNotice(message);
            void load();
          }}
        />
      )}
    </div>
  );
}
