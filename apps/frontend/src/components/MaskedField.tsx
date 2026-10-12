import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { AuditResourceType } from '@terapiainfoco/shared';
import { usePrivacy } from '../contexts/PrivacyContext';
import {
  maskCPF,
  maskEmail,
  maskPhone,
  maskName,
  maskDiagnostic,
  maskClinicalText
} from '../utils/masking';

export interface MaskedFieldProps {
  value: string | null | undefined;
  maskedValue?: string;
  type?: 'cpf' | 'email' | 'phone' | 'name' | 'diagnostic' | 'clinical' | 'text';
  resourceType: AuditResourceType;
  resourceId: string;
  fieldName: string;
  label?: string;
  allowReveal?: boolean;
  blurMode?: boolean;
  className?: string;
  readOnlyMask?: boolean;
}

export const MaskedField: React.FC<MaskedFieldProps> = ({
  value,
  maskedValue: explicitMask,
  type = 'text',
  resourceType,
  resourceId,
  fieldName,
  label,
  allowReveal = true,
  blurMode = false,
  className = '',
  readOnlyMask = false
}) => {
  const {
    isPrivacyMode,
    unmaskField,
    hideField,
    isFieldRevealed,
    getRemainingSeconds
  } = usePrivacy();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const rawValue = value || '';
  const revealed = isFieldRevealed(resourceId, fieldName);
  const remainingSeconds = getRemainingSeconds(resourceId, fieldName);

  // Computa o valor mascarado de acordo com o tipo se não fornecido explicitamente
  const computedMask = React.useMemo(() => {
    if (explicitMask) return explicitMask;
    if (isPrivacyMode) {
      // No modo Anti-Shoulder Surfing ativo, a ofuscação é total
      switch (type) {
        case 'cpf': return maskCPF(rawValue, { fullMask: true });
        case 'email': return maskEmail(rawValue, { fullMask: true });
        case 'phone': return maskPhone(rawValue, { fullMask: true });
        case 'name': return maskName(rawValue, { fullMask: true });
        case 'diagnostic': return maskDiagnostic(rawValue);
        case 'clinical': return maskClinicalText(rawValue);
        default: return '••••••••••••';
      }
    }

    switch (type) {
      case 'cpf': return maskCPF(rawValue);
      case 'email': return maskEmail(rawValue);
      case 'phone': return maskPhone(rawValue);
      case 'name': return maskName(rawValue);
      case 'diagnostic': return maskDiagnostic(rawValue);
      case 'clinical': return maskClinicalText(rawValue);
      default: return '••••••••••••';
    }
  }, [explicitMask, isPrivacyMode, type, rawValue]);

  const handleToggleReveal = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (readOnlyMask || !allowReveal) return;

    if (revealed) {
      hideField(resourceId, fieldName);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const success = await unmaskField(resourceType, resourceId, fieldName);
      if (!success) {
        setErrorMsg('Falha ao auditar revelação.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de autorização');
    } finally {
      setLoading(false);
    }
  };

  // Se o modo de privacidade global estiver ativo e o campo não estiver temporariamente revelado,
  // ou se o campo deve ser mascarado por padrão:
  const shouldMask = !revealed;

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {label && <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>}

      <span
        className={`font-mono text-xs transition-all duration-200 select-text ${
          shouldMask
            ? blurMode
              ? 'blur-[3px] select-none text-slate-400 dark:text-slate-500'
              : 'text-slate-600 dark:text-slate-400 font-semibold tracking-wider'
            : 'text-slate-900 dark:text-slate-100 font-bold bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-200/50 dark:border-teal-800/50'
        }`}
        title={shouldMask ? 'Dado mascarado por privacidade (DDM / LGPD Art. 11)' : 'Dado temporariamente revelado'}
      >
        {shouldMask ? computedMask : rawValue}
      </span>

      {/* Botão de Revelar / Ocultar com Auditoria Forense WORM */}
      {allowReveal && !readOnlyMask && (
        <button
          type="button"
          onClick={handleToggleReveal}
          disabled={loading}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-all border ${
            revealed
              ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700'
          }`}
          title={
            revealed
              ? 'Ocultar dado sensível agora'
              : 'Revelar dado sensível sob demanda (Operação registrada na trilha WORM com SHA-256)'
          }
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-teal-600" />
          ) : revealed ? (
            <>
              <EyeOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Ocultar ({remainingSeconds}s)</span>
            </>
          ) : (
            <>
              <Eye className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span>Revelar</span>
            </>
          )}
        </button>
      )}

      {/* Indicador de Auditoria WORM quando revelado */}
      {revealed && (
        <span 
          className="hidden sm:inline-flex items-center gap-0.5 text-[9px] text-teal-600 dark:text-teal-400 font-medium"
          title="Leitura gravada de forma inviolável na trilha WORM (AuditAction.DECRYPT_READ)"
        >
          <ShieldCheck className="w-2.5 h-2.5 text-teal-500" />
          <span>WORM</span>
        </span>
      )}

      {errorMsg && (
        <span className="text-[10px] text-rose-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          <span>{errorMsg}</span>
        </span>
      )}
    </span>
  );
};
