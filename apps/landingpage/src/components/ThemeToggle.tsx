import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'terapiainfoco_landing_theme';

/** Alterna claro/escuro; o tema inicial é aplicado em index.html antes da primeira pintura */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // Armazenamento indisponível: o tema vale só nesta visita
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`p-2 rounded-lg text-slate-600 hover:text-teal-700 hover:bg-slate-100 transition-colors cursor-pointer ${className}`}
      aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
      title={dark ? 'Tema claro' : 'Tema escuro'}
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
