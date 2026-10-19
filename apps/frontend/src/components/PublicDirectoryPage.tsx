import { ArrowLeft, LogIn } from 'lucide-react';
import { UserRole } from '@terapiainfoco/shared';
import { TherapistDirectory } from './TherapistDirectory';
import { ThemeToggle } from './ThemeToggle';

interface PublicDirectoryPageProps {
  onBack: () => void;
  onOpenAuth: (mode: 'login' | 'register', preselectedRole?: UserRole) => void;
}

/** Busca pública de psicólogos, sem login */
export function PublicDirectoryPage({ onBack, onOpenAuth }: PublicDirectoryPageProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2.5">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950">Ψ</span>
          <span className="font-bold text-slate-900 dark:text-white text-sm">TerapiaInFoco</span>
        </button>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => onOpenAuth('login')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
          >
            <LogIn className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> Entrar
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">Encontre um psicólogo</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Todos os profissionais listados têm registro no CRP verificado pela nossa equipe.
          </p>
        </div>
        <TherapistDirectory
          scheduleAction={{ label: 'Criar conta para agendar', onClick: () => onOpenAuth('register', UserRole.PACIENTE) }}
        />
      </main>
    </div>
  );
}
