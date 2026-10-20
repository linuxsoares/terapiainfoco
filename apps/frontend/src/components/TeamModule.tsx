import React, { useEffect, useState } from 'react';
import { UsersRound, UserPlus, RefreshCw, Copy, Check, AlertCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { UserRole } from '@terapiainfoco/shared';
import type { AdminPractice, AdminStaffMember, CreateStaffMemberResponse } from '@terapiainfoco/shared';
import { api } from '../services/api';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.PSICOLOGO_TITULAR]: 'Psicólogo(a)',
  [UserRole.SUPERVISOR_CLINICO]: 'Supervisor(a)',
  [UserRole.RECEPCAO_SECRETARIA]: 'Recepção',
  [UserRole.PACIENTE]: 'Paciente',
  [UserRole.ADMIN]: 'Administrador(a)'
};

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500';

/** Gestão de equipe do Admin: contas de Recepção e Supervisor vinculadas a um consultório */
export function TeamModule() {
  const [members, setMembers] = useState<AdminStaffMember[]>([]);
  const [practices, setPractices] = useState<AdminPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.RECEPCAO_SECRETARIA);
  const [therapistId, setTherapistId] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateStaffMemberResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [staff, practiceList] = await Promise.all([api.listStaffMembers(), api.listAdminPractices()]);
      setMembers(staff);
      setPractices(practiceList);
      setTherapistId((current) => current || practiceList[0]?.therapistId || '');
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar a equipe.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      setFormError(null);
      setCopied(false);
      const res = await api.createStaffMember({ name: name.trim(), email: email.trim(), role, therapistId });
      setCreated(res);
      setName('');
      setEmail('');
      await load();
    } catch (err: any) {
      setFormError(err.message || 'Não foi possível criar a conta.');
    } finally {
      setCreating(false);
    }
  };

  const copyPassword = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.temporaryPassword);
    setCopied(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UsersRound className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            Equipe
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Contas de recepção e supervisão vinculadas a um consultório
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

      {/* Nova conta */}
      <form
        onSubmit={handleCreate}
        className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Nova conta da equipe
        </h2>

        {practices.length === 0 && !loading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nenhum consultório cadastrado. Um psicólogo precisa criar a conta antes de a equipe ser vinculada.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="block font-semibold text-slate-700 dark:text-slate-300">Nome completo</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} required />
            </label>
            <label className="space-y-1">
              <span className="block font-semibold text-slate-700 dark:text-slate-300">E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} required />
            </label>
            <label className="space-y-1">
              <span className="block font-semibold text-slate-700 dark:text-slate-300">Perfil</span>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={INPUT_CLASS}>
                <option value={UserRole.RECEPCAO_SECRETARIA}>Recepção (agenda e cadastro, sem conteúdo clínico)</option>
                <option value={UserRole.SUPERVISOR_CLINICO}>Supervisor(a) clínico(a)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block font-semibold text-slate-700 dark:text-slate-300">Consultório</span>
              <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} className={INPUT_CLASS} required>
                {practices.map((p) => (
                  <option key={p.therapistId} value={p.therapistId}>
                    {p.name}{p.crp ? ` — CRP ${p.crp}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-rose-600 dark:text-rose-400">{formError}</span>
              <button
                type="submit"
                disabled={creating || !therapistId}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {creating ? 'Criando...' : 'Criar conta'}
              </button>
            </div>
          </div>
        )}

        {created && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs space-y-2">
            <p className="text-slate-800 dark:text-slate-200">
              Conta de <strong>{created.member.name}</strong> criada. Entregue a senha inicial por um canal seguro:
              ela não será exibida de novo. No primeiro acesso, a pessoa deve trocá-la e ativar o 2FA em Segurança.
            </p>
            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 font-mono text-sm text-slate-900 dark:text-white select-all">
                {created.temporaryPassword}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="p-2 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                title="Copiar senha"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Contas existentes */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">Contas da equipe e administradores</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 pr-4">Nome</th>
                <th className="py-2.5 pr-4">Perfil</th>
                <th className="py-2.5 pr-4">Consultório</th>
                <th className="py-2.5 text-right">2FA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-slate-900 dark:text-white block">{m.name}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{m.email}</span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{ROLE_LABELS[m.role]}</td>
                  <td className="py-3 pr-4">{m.practiceName ?? '—'}</td>
                  <td className="py-3 text-right">
                    {m.twoFactorEnabled ? (
                      <ShieldCheck className="w-4 h-4 inline text-emerald-600 dark:text-emerald-400" aria-label="2FA ativo" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 inline text-amber-600 dark:text-amber-400" aria-label="Sem 2FA" />
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500 dark:text-slate-400">Nenhuma conta da equipe.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
