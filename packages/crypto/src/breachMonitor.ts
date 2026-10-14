import { createHash } from 'node:crypto';
import {
  BreachSeverity,
  ThreatSourceType,
  UserRole
} from '@terapiainfoco/shared';

/**
 * Interface para parâmetros de cálculo de severidade de vazamento
 */
export interface BreachEvaluationParams {
  role: UserRole | string;
  source: ThreatSourceType;
  breachCount: number;
  hasPasswordExposed?: boolean;
  isRecentStealer?: boolean;
}

/**
 * Interface do par K-Anonymity Prefix/Suffix
 */
export interface KAnonymityHashSplit {
  prefix: string;   // Primeiros 5 caracteres em maiúsculas (ex: "21BD1")
  suffix: string;   // 35 caracteres restantes em maiúsculas
  fullHash: string; // Hash SHA-1 completo de 40 caracteres
}

/**
 * 1. Calcula o SHA-1 e divide em Prefix (5 chars) e Suffix (35 chars) conforme padrão k-Anonymity (NIST SP 800-63B / HIBP)
 */
export function calculateKAnonymitySplit(input: string): KAnonymityHashSplit {
  const normalized = input.trim();
  const fullHash = createHash('sha1').update(normalized, 'utf8').digest('hex').toUpperCase();
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);

  return {
    prefix,
    suffix,
    fullHash
  };
}

import { maskEmail } from './dataMasking';

/**
 * 2. Mascara e-mail ou identificador para conformidade estrita com LGPD (Art. 46) e CFP
 */
export function maskBreachedIdentifier(identifier: string): string {
  return maskEmail(identifier);
}

/**
 * 3. Compara o sufixo k-Anonymity do cliente com os registros retornados pela base de inteligência
 */
export function matchKAnonymitySuffix(
  targetSuffix: string,
  breachEntries: Array<{ suffix: string; count: number } | string>
): { matched: boolean; breachCount: number } {
  const normalizedTarget = targetSuffix.toUpperCase().trim();

  for (const entry of breachEntries) {
    if (typeof entry === 'string') {
      const [sfx, cntStr] = entry.split(':');
      if (sfx && sfx.toUpperCase().trim() === normalizedTarget) {
        return {
          matched: true,
          breachCount: cntStr ? Math.max(1, parseInt(cntStr, 10) || 1) : 1
        };
      }
    } else if (entry.suffix.toUpperCase().trim() === normalizedTarget) {
      return {
        matched: true,
        breachCount: Math.max(1, entry.count)
      };
    }
  }

  return {
    matched: false,
    breachCount: 0
  };
}

/**
 * 4. Avalia a severidade técnica e regulatória do incidente de vazamento (LGPD Art. 48 & CD/ANPD 15/2024)
 */
export function evaluateBreachSeverity(params: BreachEvaluationParams): BreachSeverity {
  const isAdmin = params.role === UserRole.ADMIN;
  const isPsychologist = params.role === UserRole.PSICOLOGO_TITULAR;
  const isStealer = params.source === ThreatSourceType.STEALER_LOGS || params.isRecentStealer;

  // Administrador comprometido em stealer ou com múltiplos vazamentos é CRÍTICO imediato
  if (isAdmin) {
    if (isStealer || (params.hasPasswordExposed && params.breachCount > 1)) {
      return BreachSeverity.CRITICAL;
    }
    return BreachSeverity.HIGH;
  }

  // Psicólogo Titular com acesso a prontuários e notas SOAP
  if (isPsychologist) {
    if (isStealer || params.hasPasswordExposed) {
      return BreachSeverity.CRITICAL;
    }
    if (params.breachCount > 3) {
      return BreachSeverity.HIGH;
    }
    return BreachSeverity.MEDIUM;
  }

  // Demais perfis (Secretaria, Paciente)
  if (isStealer || params.hasPasswordExposed) {
    return BreachSeverity.HIGH;
  }
  if (params.breachCount > 10) {
    return BreachSeverity.MEDIUM;
  }

  return BreachSeverity.LOW;
}

/**
 * 5. Determina se o incidente exige notificação formal compulsória à ANPD (Resolução CD/ANPD nº 15/2024)
 * Critério: Envolve dados sensíveis de saúde mental, perfil administrativo ou severidade CRITICAL/HIGH com credencial de staff
 */
export function requiresAnpdNotification(
  severity: BreachSeverity,
  role: UserRole | string
): boolean {
  if (severity === BreachSeverity.CRITICAL) {
    return true;
  }
  if (severity === BreachSeverity.HIGH && (role === UserRole.ADMIN || role === UserRole.PSICOLOGO_TITULAR)) {
    return true;
  }
  return false;
}

/**
 * 6. Calcula prazo limite de notificação regulatória ANPD (3 dias úteis conforme Art. 5º da Resolução CD/ANPD 15/2024)
 */
export function calculateAnpdDeadline(startDate: Date = new Date()): Date {
  const deadline = new Date(startDate.getTime());
  let addedDays = 0;

  while (addedDays < 3) {
    deadline.setDate(deadline.getDate() + 1);
    const dayOfWeek = deadline.getDay();
    // 0 = Domingo, 6 = Sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }

  // Define horário de encerramento das atividades (18:00)
  deadline.setHours(18, 0, 0, 0);
  return deadline;
}

/**
 * 7. Gera o digest canônico SHA-256 para selagem probatória do incidente no ledger WORM
 */
export function calculateIncidentWormDigest(incident: {
  incidentId: string;
  userEmailMasked: string;
  source: ThreatSourceType;
  severity: BreachSeverity;
  breachCount: number;
  detectedAt: string;
}): string {
  const canonicalString = [
    incident.incidentId,
    incident.userEmailMasked,
    incident.source,
    incident.severity,
    incident.breachCount.toString(),
    incident.detectedAt
  ].join('|');

  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
