import { describe, expect, it } from 'bun:test';
import { sanitizePii } from '../src/sanitizer';

describe('LGPD PII Sanitizer (RFC-001 §3.3 & LGPD Art. 11)', () => {
  it('deve sanitizar CPF formatado e não formatado', () => {
    const raw = 'O paciente apresentou o CPF 123.456.789-00 no início da sessão.';
    const result = sanitizePii(raw);

    expect(result.sanitizedText).toBe('O paciente apresentou o CPF [CPF] no início da sessão.');
    expect(result.replacedCount).toBe(1);
    expect(result.entitiesDetected.find(e => e.type === 'CPF')).toBeDefined();
  });

  it('deve sanitizar e-mail e número de telefone celular', () => {
    const raw = 'Podemos enviar o link para maria.silva@exemplo.com ou ligar no (11) 98765-4321.';
    const result = sanitizePii(raw);

    expect(result.sanitizedText).toContain('[EMAIL]');
    expect(result.sanitizedText).toContain('[TELEFONE]');
    expect(result.sanitizedText).not.toContain('maria.silva@exemplo.com');
    expect(result.sanitizedText).not.toContain('(11) 98765-4321');
  });

  it('deve sanitizar nomes conhecidos de paciente e terapeuta', () => {
    const raw = 'Olá Mariana Souza, aqui é a Dra. Vanessa Andrade. Como você está hoje, Mariana?';
    const result = sanitizePii(raw, {
      patientName: 'Mariana Souza',
      therapistName: 'Dra. Vanessa Andrade'
    });

    expect(result.sanitizedText).toContain('[TERAPEUTA]');
    expect(result.sanitizedText).toContain('[PACIENTE]');
    expect(result.sanitizedText).not.toContain('Mariana');
    expect(result.sanitizedText).not.toContain('Vanessa');
  });

  it('deve sanitizar menções relacionais contextuais a terceiros', () => {
    const raw = 'Tive uma discussão difícil com meu chefe Roberto e depois desabafei com meu filho Pedro.';
    const result = sanitizePii(raw);

    expect(result.sanitizedText).toContain('meu chefe [NOME_TERCEIRO]');
    expect(result.sanitizedText).toContain('meu filho [NOME_TERCEIRO]');
    expect(result.sanitizedText).not.toContain('Roberto');
    expect(result.sanitizedText).not.toContain('Pedro');
  });

  it('deve retornar contadores e metadados detalhados para auditoria LGPD', () => {
    const raw = 'Sou Juliana, meu CPF é 987.654.321-99, CEP 01310-100, fone (21) 9988-7766 e e-mail j@test.com';
    const result = sanitizePii(raw, {
      patientName: 'Juliana'
    });

    expect(result.replacedCount).toBeGreaterThanOrEqual(4);
    expect(result.entitiesDetected.length).toBeGreaterThanOrEqual(4);
  });
});
