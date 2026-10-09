import { createHmac } from 'node:crypto';

/**
 * Normaliza CPF removendo pontos, traços e espaços
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '').trim();
}

/**
 * Normaliza E-mail colocando em minúsculas e removendo espaços
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Calcula o Blind Index (HMAC-SHA256) para buscas exatas sem expor PII em texto claro
 * Conforme RFC-001 §4.3: bindex = HMAC_SHA256(dado_normalizado, salt_secret)
 */
export function computeBlindIndex(normalizedValue: string, secretSalt: string): string {
  if (!secretSalt) {
    throw new Error('Secret salt para blind indexing é obrigatório');
  }
  return createHmac('sha256', secretSalt)
    .update(normalizedValue)
    .digest('hex');
}
