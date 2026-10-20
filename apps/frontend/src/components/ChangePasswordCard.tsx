import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SafeUser } from '@terapiainfoco/shared';
import { api } from '../services/api';

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500';

/** Troca da própria senha; as sessões abertas em outros dispositivos são encerradas */
export function ChangePasswordCard({ onChanged }: { onChanged?: (user: SafeUser) => void } = {}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const user = await api.changePassword(currentPassword, newPassword);
      if (user) onChanged?.(user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Alterar senha
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Ao trocar a senha, as sessões abertas em outros dispositivos são encerradas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <label className="space-y-1">
          <span className="block font-semibold text-slate-700 dark:text-slate-300">Senha atual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="block font-semibold text-slate-700 dark:text-slate-300">Nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="block font-semibold text-slate-700 dark:text-slate-300">Confirmar nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
            required
          />
        </label>

        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            {mismatch && <span className="text-rose-600 dark:text-rose-400">As senhas não conferem.</span>}
            {error && (
              <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {error}
              </span>
            )}
            {success && (
              <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Senha alterada.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving || mismatch || newPassword.length < 8 || !currentPassword}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
