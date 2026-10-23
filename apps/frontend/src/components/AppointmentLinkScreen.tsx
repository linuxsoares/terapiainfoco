import React, { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { AppointmentStatus, type AppointmentLinkView } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface AppointmentLinkScreenProps {
  /** Token do link do lembrete por e-mail (?consulta=...) */
  token: string;
  /** Fecha a tela e segue para o app */
  onDone: () => void;
}

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

/** Confirmar presença ou cancelar a sessão pelo link do lembrete, sem login */
export const AppointmentLinkScreen: React.FC<AppointmentLinkScreenProps> = ({ token, onDone }) => {
  const [session, setSession] = useState<AppointmentLinkView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.appointmentLink(token)
      .then(setSession)
      .catch((err: any) => setError(err.message || 'Link inválido ou expirado.'))
      .finally(() => setLoading(false));
  }, [token]);

  const run = async (action: 'confirm' | 'cancel') => {
    setBusy(action);
    setError(null);
    try {
      setSession(await api.appointmentLink(token, action));
      setAskCancel(false);
    } catch (err: any) {
      setError(err.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setBusy(null);
    }
  };

  const canceled = session?.status === AppointmentStatus.CANCELADA_PELO_PACIENTE || session?.status === AppointmentStatus.CANCELADA_PELO_TERAPEUTA;
  const primaryButton = 'w-full py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60 cursor-pointer';
  const dangerButton = 'w-full py-2.5 rounded-xl text-sm font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 disabled:opacity-60 cursor-pointer';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shrink-0">
            Ψ
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Sua sessão</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">TerapiaInFoco</p>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Carregando...</p>}

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {session && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
              <CalendarCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-slate-900 dark:text-white capitalize">{formatWhen(session.scheduledStart)}</p>
                <p className="text-slate-600 dark:text-slate-300">com {session.therapistName} · horário de Brasília</p>
              </div>
            </div>

            {canceled ? (
              <div className="p-3.5 rounded-xl bg-slate-500/10 border border-slate-500/30 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2" role="status">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Sessão cancelada. Para marcar outro horário, fale com seu psicólogo ou agende pelo app.</span>
              </div>
            ) : session.patientConfirmed ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Presença confirmada. No horário, entre na sala de teleconsulta pelo app.</span>
              </div>
            ) : null}

            {!canceled && session.canConfirm && (
              <button onClick={() => run('confirm')} disabled={busy !== null} className={primaryButton}>
                {busy === 'confirm' ? 'Confirmando...' : 'Confirmar presença'}
              </button>
            )}

            {!canceled && session.canCancel && !askCancel && (
              <button onClick={() => setAskCancel(true)} disabled={busy !== null} className={dangerButton}>
                Não vou poder ir: cancelar sessão
              </button>
            )}

            {askCancel && (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-300">Cancelar libera o horário na agenda e avisa seu psicólogo. Deseja cancelar?</p>
                <button onClick={() => run('cancel')} disabled={busy !== null} className={dangerButton}>
                  {busy === 'cancel' ? 'Cancelando...' : 'Sim, cancelar a sessão'}
                </button>
                <button onClick={() => setAskCancel(false)} className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
                  Voltar
                </button>
              </div>
            )}

            {!canceled && !session.canCancel && new Date(session.scheduledStart) > new Date() && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O cancelamento online vale até {formatWhen(session.cancelDeadline)}. Depois disso, fale diretamente com seu psicólogo.
              </p>
            )}
          </div>
        )}

        {!loading && (
          <button onClick={onDone} className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
            Ir para o TerapiaInFoco
          </button>
        )}
      </div>
    </div>
  );
};
