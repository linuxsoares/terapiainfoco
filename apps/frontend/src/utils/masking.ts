/**
 * Utilitários de Mascaramento Dinâmico de Dados para o Frontend (DDM)
 * Fornece formatação segura e ofuscação no cliente contra Shoulder Surfing.
 */

export interface ClientMaskOptions {
  fullMask?: boolean;
}

export function maskCPF(cpf: string | null | undefined, options?: ClientMaskOptions): string {
  if (!cpf) return '';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  if (options?.fullMask) return '***.***.***-**';

  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(9, 11);
  return `${prefix}.***.***-${suffix}`;
}

export function maskEmail(email: string | null | undefined, options?: ClientMaskOptions): string {
  if (!email || !email.includes('@')) return '******@******';
  if (options?.fullMask) return '••••••@••••••';

  const [username, domain] = email.split('@');
  if (!username || !domain) return '******@******';

  const maskedUser = username.length <= 2 
    ? `${username[0]}***`
    : `${username[0]}***${username[username.length - 1]}`;

  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map((part, index) => {
    if (index === domainParts.length - 1) return part;
    if (part.length <= 2) return `${part[0]}*`;
    return `${part[0]}***${part[part.length - 1]}`;
  }).join('.');

  return `${maskedUser}@${maskedDomain}`;
}

export function maskPhone(phone: string | null | undefined, options?: ClientMaskOptions): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '(**) *****-****';
  if (options?.fullMask) return '(••) •••••-••••';

  const ddd = digits.slice(0, 2);
  const lastTwo = digits.slice(-2);
  if (digits.length === 11) {
    const firstDigit = digits.slice(2, 3);
    return `(${ddd}) ${firstDigit}****-**${lastTwo}`;
  }
  return `(${ddd}) ****-**${lastTwo}`;
}

export function maskName(name: string | null | undefined, options?: ClientMaskOptions): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (options?.fullMask) {
    return parts.map(p => `${p[0]}${'•'.repeat(Math.max(1, p.length - 1))}`).join(' ');
  }
  if (parts.length === 1) return `${parts[0].slice(0, 3)}••••`;
  const firstName = parts[0];
  const secondInitial = parts[1] ? `${parts[1][0]}.` : '';
  return `${firstName} ${secondInitial} •••••••`;
}

export function maskDiagnostic(hypothesis: string | null | undefined): string {
  if (!hypothesis || !hypothesis.trim()) return '[DIAGNÓSTICO NÃO REGISTRADO]';
  return '[CID-11 / HIPÓTESE DIAGNÓSTICA PROTEGIDA (LGPD ART. 11)]';
}

export function maskClinicalText(text: string | null | undefined): string {
  if (!text || !text.trim()) return '';
  return text
    .split('\n')
    .map(line => {
      if (!line.trim()) return '';
      const charCount = Math.min(line.trim().length, 80);
      return '•'.repeat(Math.max(20, charCount));
    })
    .join('\n');
}
