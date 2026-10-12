import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface WebhookSignatureResult {
  signatureHeader: string;
  signatureHex: string;
  timestamp: number;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Gera um segredo criptograficamente seguro para assinatura de webhooks
 * Formato padrão compatível com provedores modernos (ex: whsec_...)
 */
export function generateWebhookSecret(): string {
  const bytes = randomBytes(24).toString('hex');
  return `whsec_${bytes}`;
}

/**
 * Assina canonicamente o payload de um webhook utilizando HMAC-SHA256
 * Previne replay attacks concatenando timestamp UNIX em segundos (RFC 2104).
 * 
 * Formato do cabeçalho emitido:
 * X-TerapiaInFoco-Signature: t=1697123456,v1=abcdef123456...
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): WebhookSignatureResult {
  if (!secret) {
    throw new Error('Segredo de webhook é obrigatório para gerar assinatura HMAC-SHA256');
  }

  const signedContent = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedContent, 'utf8');
  const signatureHex = hmac.digest('hex');

  const signatureHeader = `t=${timestamp},v1=${signatureHex}`;

  return {
    signatureHeader,
    signatureHex,
    timestamp
  };
}

/**
 * Valida a assinatura HMAC-SHA256 do webhook e protege contra replay attacks
 * @param payload Corpo da mensagem em string original não modificada
 * @param signatureHeader Cabeçalho no formato "t=...,v1=..."
 * @param secret Segredo compartilhado da inscrição
 * @param toleranceSeconds Tolerância máxima de idade da requisição (padrão: 300s = 5 minutos)
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): WebhookVerificationResult {
  if (!signatureHeader || !secret) {
    return { valid: false, reason: 'Assinatura ou segredo ausente' };
  }

  // Extrai componentes do cabeçalho t=...,v1=...
  const parts = signatureHeader.split(',');
  let timestampStr: string | null = null;
  let receivedSignature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestampStr = value;
    if (key === 'v1') receivedSignature = value;
  }

  if (!timestampStr || !receivedSignature) {
    return { valid: false, reason: 'Cabeçalho de assinatura malformatado' };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: 'Timestamp de assinatura inválido' };
  }

  // Checagem de tolerância de tempo contra replay attacks
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTimestamp - timestamp);

  if (timeDifference > toleranceSeconds) {
    return {
      valid: false,
      reason: `Assinatura expirada: diferença de ${timeDifference}s excede a tolerância de ${toleranceSeconds}s`
    };
  }

  // Recalcula a assinatura esperada
  const signedContent = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedContent, 'utf8');
  const expectedSignature = hmac.digest('hex');

  // Comparação segura contra timing attacks (resistente a análise de canal lateral)
  try {
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Comprimento da assinatura incorreto' };
    }

    const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);
    if (!isValid) {
      return { valid: false, reason: 'Assinatura HMAC-SHA256 não confere' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Falha na validação criptográfica' };
  }
}
