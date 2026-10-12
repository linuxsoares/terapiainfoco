import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AuditResourceType } from '@terapiainfoco/shared';
import { api } from '../services/api';

interface RevealedFieldState {
  expiresAt: number;
  resourceType: AuditResourceType;
  fieldName: string;
}

interface PrivacyContextType {
  /** Indica se o Modo Anti-Shoulder Surfing global está ativo */
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (active: boolean) => void;
  
  /** Revela um campo específico sob demanda com registro auditado na trilha WORM */
  unmaskField: (resourceType: AuditResourceType, resourceId: string, fieldName: string, reason?: string) => Promise<boolean>;
  /** Oculta um campo previamente revelado */
  hideField: (resourceId: string, fieldName: string) => void;
  /** Verifica se um campo está temporariamente revelado */
  isFieldRevealed: (resourceId: string, fieldName: string) => boolean;
  /** Retorna os segundos restantes antes da auto-ocultação do campo */
  getRemainingSeconds: (resourceId: string, fieldName: string) => number;
  /** Fecha imediatamente todas as revelações ativas (botão de pânico/limpeza) */
  hideAllFields: () => void;
  /** Indicador se há requisição de auditoria em andamento */
  isAuditing: boolean;
  auditError: string | null;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

const AUTO_HIDE_SECONDS = 30;

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('terapiainfoco_privacy_mode') === 'true';
    }
    return false;
  });

  const [revealedFields, setRevealedFields] = useState<Record<string, RevealedFieldState>>({});
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const togglePrivacyMode = useCallback(() => {
    setIsPrivacyMode(prev => {
      const next = !prev;
      sessionStorage.setItem('terapiainfoco_privacy_mode', String(next));
      return next;
    });
  }, []);

  const setPrivacyMode = useCallback((active: boolean) => {
    setIsPrivacyMode(active);
    sessionStorage.setItem('terapiainfoco_privacy_mode', String(active));
  }, []);

  const hideField = useCallback((resourceId: string, fieldName: string) => {
    const key = `${resourceId}:${fieldName}`;
    setRevealedFields(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const hideAllFields = useCallback(() => {
    setRevealedFields({});
  }, []);

  const unmaskField = useCallback(async (
    resourceType: AuditResourceType,
    resourceId: string,
    fieldName: string,
    reason?: string
  ): Promise<boolean> => {
    const key = `${resourceId}:${fieldName}`;
    try {
      setIsAuditing(true);
      setAuditError(null);

      // Dispara registro imutável na trilha WORM
      await api.auditUnmask({
        resourceType,
        resourceId,
        fieldName,
        reason: reason || 'Visualização temporária em tela clínica'
      });

      const expiresAt = Date.now() + (AUTO_HIDE_SECONDS * 1000);
      setRevealedFields(prev => ({
        ...prev,
        [key]: { expiresAt, resourceType, fieldName }
      }));
      return true;
    } catch (err: any) {
      const errorMsg = err.message || 'Falha ao auditar e revelar dado sensível.';
      setAuditError(errorMsg);
      return false;
    } finally {
      setIsAuditing(false);
    }
  }, []);

  const isFieldRevealed = useCallback((resourceId: string, fieldName: string): boolean => {
    const key = `${resourceId}:${fieldName}`;
    const entry = revealedFields[key];
    if (!entry) return false;
    return Date.now() < entry.expiresAt;
  }, [revealedFields]);

  const getRemainingSeconds = useCallback((resourceId: string, fieldName: string): number => {
    const key = `${resourceId}:${fieldName}`;
    const entry = revealedFields[key];
    if (!entry) return 0;
    const diff = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    return diff;
  }, [revealedFields]);

  // Timer de limpeza periódica de campos expirados
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRevealedFields(prev => {
        let hasChanges = false;
        const next: Record<string, RevealedFieldState> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) {
            next[k] = v;
          } else {
            hasChanges = true;
          }
        }
        return hasChanges ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Atalho de Teclado Global: Alt + P (ou Cmd/Ctrl + Shift + P) para Modo Anti-Shoulder Surfing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora atalhos disparados dentro de inputs ou textareas
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (
        (e.altKey && e.key.toLowerCase() === 'p') ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') ||
        (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'p')
      ) {
        e.preventDefault();
        togglePrivacyMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePrivacyMode]);

  const value = useMemo(() => ({
    isPrivacyMode,
    togglePrivacyMode,
    setPrivacyMode,
    unmaskField,
    hideField,
    isFieldRevealed,
    getRemainingSeconds,
    hideAllFields,
    isAuditing,
    auditError
  }), [
    isPrivacyMode,
    togglePrivacyMode,
    setPrivacyMode,
    unmaskField,
    hideField,
    isFieldRevealed,
    getRemainingSeconds,
    hideAllFields,
    isAuditing,
    auditError
  ]);

  return (
    <PrivacyContext.Provider value={value}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = (): PrivacyContextType => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy deve ser utilizado dentro de um PrivacyProvider');
  }
  return context;
};
