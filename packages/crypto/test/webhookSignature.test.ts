import { describe, it, expect } from 'bun:test';
import { 
  generateWebhookSecret, 
  signWebhookPayload, 
  verifyWebhookSignature 
} from '../src/webhookSignature';

describe('Webhook Signature Engine (HMAC-SHA256 & Replay Protection - RFC-001 Opção J)', () => {
  it('deve gerar segredo seguro com prefixo whsec_ e tamanho adequado', () => {
    const secret = generateWebhookSecret();
    expect(secret.startsWith('whsec_')).toBe(true);
    expect(secret.length).toBeGreaterThan(20);
  });

  it('deve assinar e validar payload de forma determinística e íntegra', () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({
      event: 'SECURITY_ALERT',
      actorId: 'admin-123',
      ip: '192.168.1.50',
      timestamp: '2026-10-12T14:30:00Z'
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(payload, secret, nowSeconds);

    expect(signature.signatureHeader).toContain(`t=${nowSeconds},v1=`);
    expect(signature.signatureHex.length).toBe(64); // SHA-256 hex = 64 chars

    const verification = verifyWebhookSignature(payload, signature.signatureHeader, secret);
    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeUndefined();
  });

  it('deve rejeitar assinatura se o payload for adulterado (Tamper-Evidence)', () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: 'DATA_EXPORT_LGPD', patientId: 'patient-1' });

    const signature = signWebhookPayload(payload, secret);

    // Adulteração sutil de um campo no payload
    const tamperedPayload = JSON.stringify({ event: 'DATA_EXPORT_LGPD', patientId: 'patient-2' });

    const verification = verifyWebhookSignature(tamperedPayload, signature.signatureHeader, secret);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe('Assinatura HMAC-SHA256 não confere');
  });

  it('deve rejeitar assinatura se o segredo for incorreto', () => {
    const secret1 = generateWebhookSecret();
    const secret2 = generateWebhookSecret();
    const payload = JSON.stringify({ event: 'BACKUP_RESTORE' });

    const signature = signWebhookPayload(payload, secret1);

    const verification = verifyWebhookSignature(payload, signature.signatureHeader, secret2);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe('Assinatura HMAC-SHA256 não confere');
  });

  it('deve rejeitar assinaturas antigas para mitigar Replay Attacks', () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: 'CONSENT_REVOKED' });

    // Timestamp de 10 minutos atrás (600 segundos)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = signWebhookPayload(payload, secret, oldTimestamp);

    // Tolerância padrão de 300 segundos (5 minutos)
    const verification = verifyWebhookSignature(payload, signature.signatureHeader, secret, 300);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('Assinatura expirada');
  });

  it('deve rejeitar cabeçalhos malformatados ou ausentes', () => {
    const secret = generateWebhookSecret();
    const payload = 'test';

    expect(verifyWebhookSignature(payload, '', secret).valid).toBe(false);
    expect(verifyWebhookSignature(payload, 'invalid-header', secret).valid).toBe(false);
    expect(verifyWebhookSignature(payload, 't=abc,v1=123', secret).valid).toBe(false);
  });
});
