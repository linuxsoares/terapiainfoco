import React, { useState } from 'react';
import { X, Wallet, AlertCircle } from 'lucide-react';
import { PaymentMethod, SessionPaymentStatus, isValidCpf, type RegisterSessionPaymentDTO } from '@terapiainfoco/shared';
import { api } from '../services/api';

/** Dados mínimos da sessão para registrar o pagamento (vem da Agenda ou do Financeiro) */
export interface PayableSession {
  id: string;
  patientName?: string;
  scheduledStart: string | Date;
  feeCents?: number | null;
  paymentStatus?: SessionPaymentStatus;
}

interface SessionPaymentModalProps {
  session: PayableSession;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.PIX]: 'Pix',
  [PaymentMethod.CASH]: 'Dinheiro',
  [PaymentMethod.BANK_TRANSFER]: 'Transferência',
  [PaymentMethod.DEBIT_CARD]: 'Cartão de débito',
  [PaymentMethod.CREDIT_CARD]: 'Cartão de crédito'
};

export const formatBrl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const todayInBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** "250,00" ou "250" -> 25000; inválido -> null */
function parseBrlToCents(value: string): number | null {
  const normalized = value.replace(/[R$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Registrar pagamento, desfazer ou isentar uma sessão */
export const SessionPaymentModal: React.FC<SessionPaymentModalProps> = ({ session, onClose, onSaved }) => {
  const [amount, setAmount] = useState(session.feeCents ? (session.feeCents / 100).toFixed(2).replace('.', ',') : '');
  const [paidAt, setPaidAt] = useState(todayInBrasilia());
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.PIX);
  const [otherPayer, setOtherPayer] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [payerCpf, setPayerCpf] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPaid = session.paymentStatus === SessionPaymentStatus.PAID;

  const submit = async (dto: RegisterSessionPaymentDTO, message: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.registerSessionPayment(session.id, dto);
      onSaved(message);
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    const feeCents = parseBrlToCents(amount);
    if (!feeCents) {
      setError('Informe o valor da sessão (ex.: 250,00).');
      return;
    }
    if (otherPayer && (!payerName.trim() || !isValidCpf(payerCpf))) {
      setError('Informe o nome e um CPF válido de quem pagou.');
      return;
    }
    void submit(
      { status: SessionPaymentStatus.PAID, feeCents, paidAt, method, payer: otherPayer ? { name: payerName.trim(), cpf: payerCpf } : null },
      'Pagamento registrado.'
    );
  };

  const inputClass = 'w-full mt-1 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white';
  const labelClass = 'block text-xs font-bold text-slate-700 dark:text-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 id="payment-title" className="text-base font-bold text-slate-900 dark:text-white">Pagamento da sessão</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {session.patientName ?? 'Paciente'} · {new Date(session.scheduledStart).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isPaid ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Esta sessão já está paga. Se o registro foi feito por engano, desfaça para voltar às contas a receber.</p>
            <button
              onClick={() => submit({ status: SessionPaymentStatus.PENDING }, 'Pagamento desfeito: a sessão voltou para contas a receber.')}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer"
            >
              Desfazer pagamento
            </button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Valor (R$)
                <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250,00" className={inputClass} />
              </label>
              <label className={labelClass}>
                Data do pagamento
                <input type="date" required max={todayInBrasilia()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
              </label>
            </div>
            <label className={labelClass}>
              Forma de pagamento
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass}>
                {Object.values(PaymentMethod).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={otherPayer} onChange={(e) => setOtherPayer(e.target.checked)} />
              Pago por outra pessoa (ex.: responsável)
            </label>
            {otherPayer && (
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Nome de quem pagou
                  <input value={payerName} onChange={(e) => setPayerName(e.target.value)} className={inputClass} />
                </label>
                <label className={labelClass}>
                  CPF de quem pagou
                  <input inputMode="numeric" value={payerCpf} onChange={(e) => setPayerCpf(e.target.value)} placeholder="000.000.000-00" className={inputClass} />
                </label>
              </div>
            )}
            <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60 cursor-pointer">
              {saving ? 'Salvando...' : 'Registrar pagamento'}
            </button>
            {session.paymentStatus === SessionPaymentStatus.WAIVED ? (
              <button
                type="button"
                onClick={() => submit({ status: SessionPaymentStatus.PENDING }, 'Isenção desfeita: a sessão voltou para contas a receber.')}
                disabled={saving}
                className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Sessão isenta · voltar a cobrar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submit({ status: SessionPaymentStatus.WAIVED }, 'Sessão isenta: não entra nas contas a receber.')}
                disabled={saving}
                className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Não cobrar esta sessão (isentar)
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
