import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className="p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-medium cursor-pointer
        bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300
        dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700"
      title={isDark ? 'Alternar para Modo Claro (Light)' : 'Alternar para Modo Escuro (Dark)'}
      aria-label="Alternar tema"
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
          <span className="hidden md:inline">Claro</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-indigo-600" />
          <span className="hidden md:inline">Escuro</span>
        </>
      )}
    </button>
  );
}
