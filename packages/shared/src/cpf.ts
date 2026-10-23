/** Só os dígitos do CPF */
export function normalizeCpfDigits(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/** CPF com 11 dígitos e dígitos verificadores corretos (rejeita sequências repetidas) */
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpfDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/** 000.000.000-00 */
export function formatCpf(cpf: string): string {
  const d = normalizeCpfDigits(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}
