import { describe, it, expect } from 'bun:test';
import {
  maskCPF,
  maskEmail,
  maskPhone,
  maskName,
  maskDiagnosticHypothesis,
  maskClinicalText,
  maskPatientData
} from '../src/dataMasking';

describe('Dynamic Data Masking (DDM) Engine - RFC-001 Opção K & LGPD Art. 11', () => {
  describe('maskCPF', () => {
    it('deve mascarar CPF formatado preservando prefixo e sufixo por padrão', () => {
      const masked = maskCPF('123.456.789-00');
      expect(masked).toBe('123.***.***-00');
    });

    it('deve mascarar CPF numérico puro sem pontuação', () => {
      const masked = maskCPF('12345678900');
      expect(masked).toBe('123.***.***-00');
    });

    it('deve aplicar ofuscação integral quando fullMask for true', () => {
      const masked = maskCPF('123.456.789-00', { fullMask: true });
      expect(masked).toBe('***.***.***-**');
    });

    it('deve retornar máscara padrão para valores nulos, vazios ou inválidos', () => {
      expect(maskCPF(null)).toBe('');
      expect(maskCPF('')).toBe('');
      expect(maskCPF('12345')).toBe('***.***.***-**');
    });
  });

  describe('maskEmail', () => {
    it('deve mascarar usuário e domínio intermediário preservando TLD', () => {
      const masked = maskEmail('mariana.silva@email.com');
      expect(masked).toMatch(/^m\*\*\*a@e\*\*\*l\.com$/);
    });

    it('deve tratar e-mails curtos graciosamente', () => {
      const masked = maskEmail('ab@cd.com');
      expect(masked).toContain('@');
      expect(masked).toContain('.com');
    });

    it('deve aplicar ofuscação completa quando fullMask for ativado', () => {
      const masked = maskEmail('mariana.silva@email.com', { fullMask: true });
      expect(masked).toBe('••••••@••••••');
    });

    it('deve tratar entradas malformatadas ou nulas', () => {
      expect(maskEmail('email-sem-arroba')).toBe('******@******');
      expect(maskEmail(null)).toBe('******@******');
    });
  });

  describe('maskPhone', () => {
    it('deve mascarar celular de 11 dígitos preservando DDD e os 2 últimos dígitos', () => {
      const masked = maskPhone('11987654321');
      expect(masked).toBe('(11) 9****-**21');
    });

    it('deve aceitar telefone formatado com parênteses e traço', () => {
      const masked = maskPhone('(11) 98765-4321');
      expect(masked).toBe('(11) 9****-**21');
    });

    it('deve mascarar telefone fixo de 10 dígitos', () => {
      const masked = maskPhone('1134567890');
      expect(masked).toBe('(11) ****-**90');
    });

    it('deve aplicar ofuscação integral quando fullMask for true', () => {
      const masked = maskPhone('11987654321', { fullMask: true });
      expect(masked).toBe('(••) •••••-••••');
    });
  });

  describe('maskName', () => {
    it('deve proteger nome completo de paciente mantendo primeiro nome e inicial', () => {
      const masked = maskName('Mariana Silva de Oliveira');
      expect(masked).toBe('Mariana S. •••••••');
    });

    it('deve ofuscar nome monônimo', () => {
      const masked = maskName('Mariana');
      expect(masked).toBe('Mar••••');
    });

    it('deve aplicar ofuscação total no modo Anti-Shoulder Surfing integral', () => {
      const masked = maskName('Beatriz Santos', { fullMask: true });
      expect(masked).toContain('•');
      expect(masked.startsWith('B')).toBe(true);
    });
  });

  describe('maskDiagnosticHypothesis & maskClinicalText', () => {
    it('deve substituir diagnóstico clínico por aviso regulatório LGPD Art. 11', () => {
      const masked = maskDiagnosticHypothesis('F32.1 - Transtorno Depressivo Moderado');
      expect(masked).toBe('[CID-11 / HIPÓTESE DIAGNÓSTICA PROTEGIDA (LGPD ART. 11)]');
    });

    it('deve retornar aviso adequado para diagnóstico não informado', () => {
      expect(maskDiagnosticHypothesis('')).toBe('[DIAGNÓSTICO NÃO REGISTRADO]');
      expect(maskDiagnosticHypothesis(null)).toBe('[DIAGNÓSTICO NÃO REGISTRADO]');
    });

    it('deve ofuscar texto clínico de prontuário mantendo formato de linhas', () => {
      const clinicalNotes = 'Paciente relata episódios de taquicardia ao entrar no metrô.\nUtilizou técnicas de respiração diafragmática com sucesso.';
      const masked = maskClinicalText(clinicalNotes);
      
      expect(masked).not.toContain('taquicardia');
      expect(masked).not.toContain('metrô');
      expect(masked.includes('•')).toBe(true);
      expect(masked.split('\n').length).toBe(2);
    });

    it('deve emitir aviso de clique para revelar quando placeholderNotice for ativado', () => {
      const notice = maskClinicalText('Anotação confidencial', { placeholderNotice: true });
      expect(notice).toContain('MODO ANTI-SHOULDER SURFING ATIVO');
      expect(notice).toContain('AUDITADO LGPD');
    });
  });

  describe('maskPatientData', () => {
    it('deve aplicar mascaramento em lote de todos os campos sensíveis cadastrais', () => {
      const original = {
        id: 'patient-001',
        name: 'Mariana Silva de Oliveira',
        email: 'mariana.silva@email.com',
        phone: '11987654321',
        cpf: '123.456.789-00'
      };

      const result = maskPatientData(original);

      expect(result.isMasked).toBe(true);
      expect(result.id).toBe('patient-001');
      expect(result.name).toBe('Mariana S. •••••••');
      expect(result.cpf).toBe('123.***.***-00');
      expect(result.phone).toBe('(11) 9****-**21');
      expect(result.email).toContain('@');
    });
  });
});
