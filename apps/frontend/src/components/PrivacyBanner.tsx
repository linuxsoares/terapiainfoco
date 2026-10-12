import React from 'react';
import { Shield, EyeOff, X, Lock } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

export const PrivacyBanner: React.FC = () => {
  const { isPrivacyMode, togglePrivacyMode, hideAllFields } = usePrivacy();

  if (!isPrivacyMode) return null;

  return (
    <div className="bg-gradient-to-r from-amber-600/90 via-amber-700/90 to-amber-800/90 dark:from-amber-950/90 dark:via-amber-900/90 dark:to-slate-900/90 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md border-b border-amber-500/30 backdrop-blur-sm animate-fade-in z-40">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded bg-white/20 text-amber-200">
          <EyeOff className="w-3.5 h-3.5" />
        </div>
        <div>
          <span className="font-bold tracking-wide">Modo Anti-Shoulder Surfing Ativo</span>
          <span className="hidden sm:inline text-amber-100/90 ml-1.5 font-normal">
            — Dados sensíveis, CPFs e prontuários estão protegidos visualmente na tela (LGPD Art. 11).
          </span>
          <span className="hidden md:inline text-amber-200/80 ml-2 text-[11px] font-mono">
            [Atalho: Alt+P]
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={hideAllFields}
          className="px-2.5 py-0.5 rounded bg-black/30 hover:bg-black/50 text-[11px] font-medium transition-colors border border-white/20"
          title="Ocultar imediatamente todos os dados revelados"
        >
          <Lock className="w-3 h-3 inline mr-1" />
          Ocultar Todos
        </button>

        <button
          onClick={togglePrivacyMode}
          className="p-1 rounded hover:bg-white/20 transition-colors text-white/80 hover:text-white"
          title="Desativar Modo Anti-Shoulder Surfing"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const PrivacyToggleButton: React.FC = () => {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacy();

  return (
    <button
      onClick={togglePrivacyMode}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
        isPrivacyMode
          ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 shadow-sm'
          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
      }`}
      title="Ativar/Desativar Modo Anti-Shoulder Surfing (Atalho: Alt + P)"
    >
      {isPrivacyMode ? (
        <>
          <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Privacidade ON 🛡️</span>
        </>
      ) : (
        <>
          <Shield className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="hidden sm:inline">Anti-Shoulder (Alt+P)</span>
          <span className="sm:hidden">Privacidade</span>
        </>
      )}
    </button>
  );
};
