import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface PasswordResetScreenProps {
  /** Token do link enviado por e-mail (?redefinir-senha=...) */
  token: string;
  /** Concluído ou cancelado: volta ao app (o login abre em seguida) */
  onDone: () => void;
}

/** Nova senha a partir do link de recuperação; o token vale uma vez e por 30 minutos */
export const PasswordResetScreen: React.FC<PasswordResetScreenProps> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('A nova senha deve conter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDone(await api.resetPassword(token, password));
    } catch (err: any) {
      setError(err.message || 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shrink-0">
            Ψ
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Criar nova senha</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">TerapiaInFoco</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{done} Por segurança, as sessões abertas em outros dispositivos foram encerradas.</span>
            </div>
            <button
              onClick={onDone}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 cursor-pointer"
            >
              Ir para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Nova senha
              <span className="relative block mt-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="password" required autoFocus minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
              </span>
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Confirme a nova senha
              <span className="relative block mt-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputClass} />
              </span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
            <button type="button" onClick={onDone} className="w-full text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
