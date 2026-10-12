/**
 * Motor de Mascaramento Dinâmico de Dados (Dynamic Data Masking - DDM)
 * RFC-001 §3.4, §4.4 e LGPD Art. 11 (Dados Pessoais Sensíveis de Saúde)
 * 
 * Fornece ofuscação determinística e configurável para exibição visual
 * segura em telas clínicas, mitigando riscos de Shoulder Surfing
 * e vazamentos visuais em ambientes compartilhados.
 */

export interface MaskingOptions {
  /** Se verdadeiro, aplica ofuscação integral sem preservar dígitos ou caracteres parciais */
  fullMask?: boolean;
  /** Caractere substituto padrão (padrão: '•' ou '*') */
  maskChar?: string;
}

/**
 * Mascara CPF brasileiro mantendo opcionalmente o prefixo e sufixo para conferência clínica.
 * Exemplo padrão: '123.456.789-00' -> '123.***.***-00'
 * Exemplo fullMask: '123.456.789-00' -> '***.***.***-**'
 */
export function maskCPF(cpf: string | null | undefined, options?: MaskingOptions): string {
  if (!cpf) return '';
  const digits = cpf.replace(/\D/g, '');
  
  if (digits.length !== 11) {
    return '***.***.***-**';
  }

  if (options?.fullMask) {
    return '***.***.***-**';
  }

  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(9, 11);
  return `${prefix}.***.***-${suffix}`;
}

/**
 * Mascara endereço de e-mail preservando a estrutura de domínio básica.
 * Exemplo: 'mariana.silva@email.com' -> 'm***a@e***l.com'
 */
export function maskEmail(email: string | null | undefined, options?: MaskingOptions): string {
  if (!email || !email.includes('@')) return '******@******';

  if (options?.fullMask) {
    return '••••••@••••••';
  }

  const [username, domain] = email.split('@');
  if (!username || !domain) return '******@******';

  const maskedUser = username.length <= 2 
    ? `${username[0]}***`
    : `${username[0]}***${username[username.length - 1]}`;

  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map((part, index) => {
    if (index === domainParts.length - 1) return part; // Mantém extensão TLD (ex: .com, .br)
    if (part.length <= 2) return `${part[0]}*`;
    return `${part[0]}***${part[part.length - 1]}`;
  }).join('.');

  return `${maskedUser}@${maskedDomain}`;
}

/**
 * Mascara número de telefone brasileiro preservando o DDD e os 2 últimos dígitos.
 * Exemplo: '11987654321' -> '(11) 9****-**21'
 */
export function maskPhone(phone: string | null | undefined, options?: MaskingOptions): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 10) {
    return '(**) *****-****';
  }

  if (options?.fullMask) {
    return '(••) •••••-••••';
  }

  const ddd = digits.slice(0, 2);
  const lastTwo = digits.slice(-2);
  const isNineDigits = digits.length === 11;

  if (isNineDigits) {
    const firstDigit = digits.slice(2, 3);
    return `(${ddd}) ${firstDigit}****-**${lastTwo}`;
  }

  return `(${ddd}) ****-**${lastTwo}`;
}

/**
 * Mascara nome próprio de paciente para evitar identificação direta por terceiros (Shoulder Surfing).
 * Exemplo: 'Mariana Silva de Oliveira' -> 'Mariana S. •••••••'
 */
export function maskName(name: string | null | undefined, options?: MaskingOptions): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);

  if (options?.fullMask) {
    return parts.map(p => `${p[0]}${'•'.repeat(Math.max(1, p.length - 1))}`).join(' ');
  }

  if (parts.length === 1) {
    return `${parts[0].slice(0, 3)}••••`;
  }

  const firstName = parts[0];
  const secondInitial = parts[1] ? `${parts[1][0]}.` : '';
  return `${firstName} ${secondInitial} •••••••`;
}

/**
 * Ofusca hipótese diagnóstica / CID-11 conforme exigência do Artigo 11 da LGPD
 * para dados de saúde altamente sensíveis.
 */
export function maskDiagnosticHypothesis(hypothesis: string | null | undefined): string {
  if (!hypothesis || !hypothesis.trim()) {
    return '[DIAGNÓSTICO NÃO REGISTRADO]';
  }
  return '[CID-11 / HIPÓTESE DIAGNÓSTICA PROTEGIDA (LGPD ART. 11)]';
}

/**
 * Mascara texto livre clínico (anotações de evolução SOAP, queixas subjetivas, notas confidenciais).
 * Substitui o texto por um bloco ofuscado estruturado ou indicador visual.
 */
export function maskClinicalText(text: string | null | undefined, options?: { placeholderNotice?: boolean }): string {
  if (!text || !text.trim()) return '';

  if (options?.placeholderNotice) {
    return '[DADO CLÍNICO CONFIDENCIAL • MODO ANTI-SHOULDER SURFING ATIVO • CLIQUE PARA REVELAR (AUDITADO LGPD)]';
  }

  // Gera uma representação ofuscada que mantém o ritmo visual dos parágrafos
  return text
    .split('\n')
    .map(line => {
      if (!line.trim()) return '';
      const charCount = Math.min(line.trim().length, 80);
      return '•'.repeat(Math.max(20, charCount));
    })
    .join('\n');
}

/**
 * Aplica mascaramento dinâmico em lote aos dados cadastrais de um paciente.
 */
export function maskPatientData<T extends { name: string; email: string; phone: string; cpf?: string }>(
  patient: T,
  options?: MaskingOptions
): T & { isMasked: true } {
  return {
    ...patient,
    name: maskName(patient.name, options),
    email: maskEmail(patient.email, options),
    phone: maskPhone(patient.phone, options),
    cpf: patient.cpf ? maskCPF(patient.cpf, options) : undefined,
    isMasked: true
  };
}
