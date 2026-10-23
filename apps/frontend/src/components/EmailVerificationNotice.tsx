import React, { useState } from 'react';
import { MailWarning, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { api } from '../services/api';

/** Aviso no painel enquanto o e-mail da conta não foi confirmado, com reenvio do link */
export const EmailVerificationBanner: React.FC<{ email: string }> = ({ email }) => {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const resend = async () => {
    setStatus('sending');
    try {
      setMessage(await api.resendEmailVerification());
      setStatus('sent');
    } catch (err: any) {
      setMessage(err.message || 'Não foi possível reenviar agora.');
      setStatus('error');
    }
  };

  return (
    <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center gap-3" role="status">
      <MailWarning className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1">
        {status === 'sent' || status === 'error'
          ? message
          : <>Confirme o e-mail <strong>{email}</strong> pelo link que enviamos. Sem a confirmação você não recebe avisos de agendamento.</>}
      </span>
      {status !== 'sent' && (
        <button
          onClick={resend}
          disabled={status === 'sending'}
          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold disabled:opacity-60 cursor-pointer self-start sm:self-auto"
        >
          {status === 'sending' ? 'Enviando...' : 'Reenviar link'}
        </button>
      )}
    </div>
  );
};

export interface FlashNotice {
  type: 'success' | 'error';
  text: string;
}

/** Mensagem flutuante (ex.: resultado do link de confirmação aberto a partir do e-mail) */
export const FlashNoticeToast: React.FC<{ notice: FlashNotice | null; onClose: () => void }> = ({ notice, onClose }) => {
  if (!notice) return null;
  const success = notice.type === 'success';
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md" role={success ? 'status' : 'alert'}>
      <div className={`p-3.5 rounded-2xl border shadow-lg text-sm flex items-start gap-2 ${
        success
          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200'
          : 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950 dark:border-rose-700 dark:text-rose-200'
      }`}>
        {success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
        <span className="flex-1">{notice.text}</span>
        <button onClick={onClose} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
