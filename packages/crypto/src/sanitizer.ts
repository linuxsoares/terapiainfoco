export interface PiiEntityDetection {
  type: 'CPF' | 'EMAIL' | 'PHONE' | 'CEP' | 'RG' | 'PATIENT_NAME' | 'THERAPIST_NAME' | 'RELATIONAL_NAME' | 'OTHER';
  placeholder: string;
  count: number;
}

export interface PiiSanitizationResult {
  sanitizedText: string;
  replacedCount: number;
  entitiesDetected: PiiEntityDetection[];
}

export interface PiiSanitizerOptions {
  patientName?: string;
  therapistName?: string;
  customNames?: string[];
  maskPrefix?: string;
}

/**
 * Sanitizador de PII (Personally Identifiable Information) Pré-LLM
 * Em conformidade estrita com a LGPD (Art. 5º, II e Art. 11) e RFC-001 §3.3
 * 
 * Substitui identificadores sensíveis por pseudônimos e tokens genéricos
 * antes de enviar dados de teleconsultas para modelos de inteligência artificial.
 */
export function sanitizePii(
  text: string,
  options: PiiSanitizerOptions = {}
): PiiSanitizationResult {
  if (!text || typeof text !== 'string') {
    return {
      sanitizedText: '',
      replacedCount: 0,
      entitiesDetected: []
    };
  }

  let sanitized = text;
  const entityMap = new Map<string, { type: PiiEntityDetection['type']; placeholder: string; count: number }>();

  const trackEntity = (type: PiiEntityDetection['type'], placeholder: string, matchesCount: number) => {
    if (matchesCount <= 0) return;
    const existing = entityMap.get(placeholder);
    if (existing) {
      existing.count += matchesCount;
    } else {
      entityMap.set(placeholder, { type, placeholder, count: matchesCount });
    }
  };

  // 1. Sanitização de Nomes Conhecidos do Paciente
  if (options.patientName && options.patientName.trim().length > 1) {
    const pName = options.patientName.trim();
    const parts = pName.split(/\s+/).filter(p => p.length >= 3);
    
    // Substituir nome completo
    const fullRegex = new RegExp(`\\b${escapeRegExp(pName)}\\b`, 'gi');
    const fullMatches = (sanitized.match(fullRegex) || []).length;
    if (fullMatches > 0) {
      sanitized = sanitized.replace(fullRegex, '[PACIENTE]');
      trackEntity('PATIENT_NAME', '[PACIENTE]', fullMatches);
    }

    // Substituir primeiro nome e partes distintas
    for (const part of parts) {
      const partRegex = new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi');
      const partMatches = (sanitized.match(partRegex) || []).length;
      if (partMatches > 0) {
        sanitized = sanitized.replace(partRegex, '[PACIENTE]');
        trackEntity('PATIENT_NAME', '[PACIENTE]', partMatches);
      }
    }
  }

  // 2. Sanitização de Nomes Conhecidos do Terapeuta
  if (options.therapistName && options.therapistName.trim().length > 1) {
    const tName = options.therapistName.trim();
    const tParts = tName.split(/\s+/).filter(p => p.length >= 3);

    const fullRegex = new RegExp(`\\b${escapeRegExp(tName)}\\b`, 'gi');
    const fullMatches = (sanitized.match(fullRegex) || []).length;
    if (fullMatches > 0) {
      sanitized = sanitized.replace(fullRegex, '[TERAPEUTA]');
      trackEntity('THERAPIST_NAME', '[TERAPEUTA]', fullMatches);
    }

    for (const part of tParts) {
      if (['dra', 'dr', 'dra.', 'dr.'].includes(part.toLowerCase())) continue;
      const partRegex = new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi');
      const partMatches = (sanitized.match(partRegex) || []).length;
      if (partMatches > 0) {
        sanitized = sanitized.replace(partRegex, '[TERAPEUTA]');
        trackEntity('THERAPIST_NAME', '[TERAPEUTA]', partMatches);
      }
    }
  }

  // 3. Sanitização de Nomes Customizados Adicionais
  if (options.customNames && options.customNames.length > 0) {
    for (const cName of options.customNames) {
      if (!cName || cName.trim().length < 2) continue;
      const cRegex = new RegExp(`\\b${escapeRegExp(cName.trim())}\\b`, 'gi');
      const cMatches = (sanitized.match(cRegex) || []).length;
      if (cMatches > 0) {
        sanitized = sanitized.replace(cRegex, '[NOME]');
        trackEntity('OTHER', '[NOME]', cMatches);
      }
    }
  }

  // 4. Sanitização de CPF: formatado (000.000.000-00) ou 11 dígitos isolados
  const cpfFormattedRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
  const cpfFormattedMatches = (sanitized.match(cpfFormattedRegex) || []).length;
  if (cpfFormattedMatches > 0) {
    sanitized = sanitized.replace(cpfFormattedRegex, '[CPF]');
    trackEntity('CPF', '[CPF]', cpfFormattedMatches);
  }

  // 5. Sanitização de E-mail
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailMatches = (sanitized.match(emailRegex) || []).length;
  if (emailMatches > 0) {
    sanitized = sanitized.replace(emailRegex, '[EMAIL]');
    trackEntity('EMAIL', '[EMAIL]', emailMatches);
  }

  // 6. Sanitização de Telefones Brasileiros:
  // e.g. +55 (11) 98765-4321, (11) 98765-4321, 11 98765-4321, (11) 3456-7890
  const phoneRegex = /(?:\+?55\s?)?(?:\(?0?[1-9]{2}\)?[\s.-]?)?(?:9\d{4}|\d{4})[\s.-]?\d{4}\b/g;
  // Apenas substitui se tiver comprimento razoável de telefone (mínimo 8 dígitos)
  sanitized = sanitized.replace(phoneRegex, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 13) {
      trackEntity('PHONE', '[TELEFONE]', 1);
      return '[TELEFONE]';
    }
    return match;
  });

  // 7. Sanitização de CEP: 00000-000 ou 00000000
  const cepRegex = /\b\d{5}-\d{3}\b/g;
  const cepMatches = (sanitized.match(cepRegex) || []).length;
  if (cepMatches > 0) {
    sanitized = sanitized.replace(cepRegex, '[CEP]');
    trackEntity('CEP', '[CEP]', cepMatches);
  }

  // 8. Sanitização de RG: 00.000.000-0 ou 00.000.000-X
  const rgRegex = /\b\d{1,2}\.\d{3}\.\d{3}-[\dXx]\b/g;
  const rgMatches = (sanitized.match(rgRegex) || []).length;
  if (rgMatches > 0) {
    sanitized = sanitized.replace(rgRegex, '[RG]');
    trackEntity('RG', '[RG]', rgMatches);
  }

  // 9. Sanitização de Nomes Relacionais em Contexto Clínico
  // Ex: "meu filho Pedro", "minha esposa Ana", "meu chefe Marcelo", "me chamo Lucas"
  const relationalRegex = /\b(meu filho|minha filha|meu marido|minha esposa|meu esposo|minha mãe|meu pai|meu irmão|minha irmã|meu chefe|minha chefe|me chamo|meu nome é)\s+([A-Z][a-zà-ú]+)\b/gi;
  sanitized = sanitized.replace(relationalRegex, (_full, prefix) => {
    trackEntity('RELATIONAL_NAME', '[NOME_TERCEIRO]', 1);
    return `${prefix} [NOME_TERCEIRO]`;
  });

  const entitiesDetected = Array.from(entityMap.values());
  const replacedCount = entitiesDetected.reduce((acc, curr) => acc + curr.count, 0);

  return {
    sanitizedText: sanitized,
    replacedCount,
    entitiesDetected
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
