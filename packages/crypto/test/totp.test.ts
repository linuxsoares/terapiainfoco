import { describe, expect, it } from 'bun:test';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateTotpUri,
  generateBackupCodes
} from '../src/totp';

describe('TOTP / 2FA Engine (RFC 6238 & LGPD Opção C)', () => {
  it('deve codificar e decodificar Base32 de forma reversível', () => {
    const raw = Buffer.from('TerapiaInFoco 2026!');
    const encoded = base32Encode(raw);
    const decoded = base32Decode(encoded);
    expect(decoded.toString('utf-8')).toBe('TerapiaInFoco 2026!');
  });

  it('deve gerar segredo Base32 aleatório com tamanho válido', () => {
    const secret = generateTotpSecret(20);
    expect(secret.length).toBe(32); // 20 bytes -> 32 caracteres Base32
    expect(typeof secret).toBe('string');
  });

  it('deve gerar código TOTP de 6 dígitos numéricos determinístico', () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // Base32 do RFC test
    const timeSec = 1700000000;
    const code = generateTotpCode(secret, timeSec);

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    // No mesmo timestamp deve produzir exatamente o mesmo código
    const sameCode = generateTotpCode(secret, timeSec);
    expect(sameCode).toBe(code);
  });

  it('deve verificar código correto dentro da janela de tolerância de 30s', () => {
    const secret = generateTotpSecret();
    const now = Math.floor(Date.now() / 1000);
    const currentCode = generateTotpCode(secret, now);

    // Valida código atual
    expect(verifyTotpCode(secret, currentCode, 1, 30, now)).toBe(true);

    // Valida código com tolerância de drift de relógio (ex: gerado 25s atrás)
    const pastCode = generateTotpCode(secret, now - 25);
    expect(verifyTotpCode(secret, pastCode, 1, 30, now)).toBe(true);

    // Rejeita código fora da janela (ex: 90s atrás)
    const expiredCode = generateTotpCode(secret, now - 95);
    expect(verifyTotpCode(secret, expiredCode, 1, 30, now)).toBe(false);
  });

  it('deve rejeitar código com formatação errada ou token inexistente', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '12345')).toBe(false);
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
    expect(verifyTotpCode(secret, '')).toBe(false);
  });

  it('deve gerar URI otpauth compatível com apps autenticadores', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = generateTotpUri('dra.beatriz@terapiainfoco.com.br', 'TerapiaInFoco', secret);

    expect(uri).toContain('otpauth://totp/TerapiaInFoco:dra.beatriz%40terapiainfoco.com.br');
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
  });

  it('deve gerar códigos de backup únicos no formato XXXX-XXXX', () => {
    const backupCodes = generateBackupCodes(8);
    expect(backupCodes).toHaveLength(8);

    const regex = /^[A-F0-9]{4}-[A-F0-9]{4}$/;
    backupCodes.forEach(code => {
      expect(regex.test(code)).toBe(true);
    });

    // Garante que todos são distintos
    const unique = new Set(backupCodes);
    expect(unique.size).toBe(8);
  });
});
