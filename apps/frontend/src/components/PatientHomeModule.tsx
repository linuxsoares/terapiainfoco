import { HeartHandshake, FolderLock, User, ShieldCheck } from 'lucide-react';
import type { SafeUser } from '@terapiainfoco/shared';

interface PatientHomeModuleProps {
  currentUser: SafeUser;
  onOpenPortal: () => void;
  onOpenPortabilityVault: () => void;
  onOpenProfile: () => void;
}

/**
 * Espaço do paciente (titular LGPD Art. 18): ponto de entrada para exercícios,
 * recibos, termos TCLE, cofre de portabilidade e dados cadastrais.
 */
export function PatientHomeModule({ currentUser, onOpenPortal, onOpenPortabilityVault, onOpenProfile }: PatientHomeModuleProps) {
  const actions = [
    {
      title: 'Exercícios, Recibos & TCLE',
      description: 'Exercícios terapêuticos (TCC/ACT/DBT) indicados pelo seu psicólogo, recibos para reembolso e termos de consentimento.',
      icon: HeartHandshake,
      accent: 'bg-indigo-600 hover:bg-indigo-700',
      onClick: onOpenPortal
    },
    {
      title: 'Cofre de Portabilidade (.enc)',
      description: 'Exporte seu histórico clínico em um pacote cifrado com a sua senha (LGPD Art. 18).',
      icon: FolderLock,
      accent: 'bg-teal-600 hover:bg-teal-700',
      onClick: onOpenPortabilityVault
    },
    {
      title: 'Meu Perfil',
      description: 'Dados de contato, rede de apoio para emergências e métodos de login.',
      icon: User,
      accent: 'bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600',
      onClick: onOpenProfile
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-indigo-600/10 via-teal-500/10 to-emerald-500/10 p-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Olá, {currentUser.name}!</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Este é o seu espaço. Aqui você acompanha o que o seu psicólogo compartilhou com você e exerce seus direitos de titular dos dados.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map(({ title, description, icon: Icon, accent, onClick }) => (
          <button
            key={title}
            onClick={onClick}
            className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
          >
            <span className={`w-10 h-10 rounded-xl text-white flex items-center justify-center ${accent}`}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{description}</span>
          </button>
        ))}
      </div>

      <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
        Seus dados clínicos são cifrados (AES-256-GCM) e só o seu psicólogo responsável tem acesso ao prontuário (CFP nº 001/2009).
      </p>
    </div>
  );
}
