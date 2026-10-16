import { describe, it, expect } from 'bun:test';
import {
  analyzeRegexComplexity,
  executeSafeRegex,
  createRedosProofSeal,
  verifyRedosProofSeal,
  CLINICAL_REGEX_PRESETS
} from '../src/redosGuard';
import {
  RegexComplexityRisk,
  RegexVulnerabilityType,
  RegexSanitizationAction,
  RegexClinicalPresetType
} from '@terapiainfoco/shared';

describe('ReDoS Guard & Safe Regex Engine (CWE-1333 & OWASP ASVS V5.5)', () => {
  describe('Análise Estática de Complexidade de Regex (AST Heuristics)', () => {
    it('deve classificar regex simples e linear como SAFE_LINEAR', () => {
      const pattern = '^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$';
      const analysis = analyzeRegexComplexity(pattern);

      expect(analysis.complexity).toBe(RegexComplexityRisk.SAFE_LINEAR);
      expect(analysis.vulnerabilityType).toBe(RegexVulnerabilityType.NONE);
      expect(analysis.isVulnerable).toBe(false);
      expect(analysis.hasNestedQuantifiers).toBe(false);
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('deve detectar quantificadores aninhados (a+)+ e classificar como CRITICAL_EXPONENTIAL_EVIL', () => {
      const evilPattern = '(a+)+$';
      const analysis = analyzeRegexComplexity(evilPattern);

      expect(analysis.complexity).toBe(RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL);
      expect(analysis.vulnerabilityType).toBe(RegexVulnerabilityType.NESTED_QUANTIFIERS);
      expect(analysis.isVulnerable).toBe(true);
      expect(analysis.hasNestedQuantifiers).toBe(true);
      expect(analysis.suggestedSafePattern).toBeDefined();
    });

    it('deve detectar quantificadores aninhados em classes de caracteres ([a-z]+)*', () => {
      const evilPattern = '^([a-z]+)*$';
      const analysis = analyzeRegexComplexity(evilPattern);

      expect(analysis.complexity).toBe(RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL);
      expect(analysis.vulnerabilityType).toBe(RegexVulnerabilityType.NESTED_QUANTIFIERS);
      expect(analysis.isVulnerable).toBe(true);
    });

    it('deve detectar disjunções sobrepostas ambíguas (a|aa)+', () => {
      const pattern = '(a|aa)+$';
      const analysis = analyzeRegexComplexity(pattern);

      expect(analysis.hasOverlappingDisjunction).toBe(true);
      expect(analysis.isVulnerable).toBe(true);
      expect(analysis.complexity).toBe(RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL);
    });

    it('deve detectar repetições ilimitadas adjacentes .*.*', () => {
      const pattern = '^.*.*$';
      const analysis = analyzeRegexComplexity(pattern);

      expect(analysis.hasAdjacentUnboundedRepetitions).toBe(true);
      expect(analysis.vulnerabilityType).toBe(RegexVulnerabilityType.ADJACENT_UNBOUNDED_REPETITIONS);
      expect(analysis.isVulnerable).toBe(true);
    });

    it('deve garantir que todos os presets clínicos oficiais são SAFE_LINEAR e não-vulneráveis', () => {
      expect(CLINICAL_REGEX_PRESETS.length).toBeGreaterThanOrEqual(7);

      for (const preset of CLINICAL_REGEX_PRESETS) {
        const analysis = analyzeRegexComplexity(preset.pattern);
        expect(analysis.isVulnerable).toBe(false);
        expect(analysis.complexity).toBe(RegexComplexityRisk.SAFE_LINEAR);
        expect(analysis.vulnerabilityType).toBe(RegexVulnerabilityType.NONE);

        // Valida amostra positiva
        const rx = new RegExp(preset.pattern);
        expect(rx.test(preset.sampleValid)).toBe(true);
      }
    });
  });

  describe('Executor Seguro com Guardrails de Timeout Não-Bloqueante', () => {
    it('deve executar expressão linear válida e retornar match com sucesso', () => {
      const result = executeSafeRegex({
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        input: '2026-10-16',
        timeoutMs: 50
      });

      expect(result.matched).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.actionTaken).toBe(RegexSanitizationAction.ALLOWED_SAFE);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeLessThan(100);
    });

    it('deve interromper com guardrail sem travar a thread diante de payload ReDoS catastrófico', () => {
      const evilPattern = '(a+)+$';
      // String de 25 "a"s terminando com caracter diferente "!", típica para disparar catastrophic backtracking
      const evilPayload = 'aaaaaaaaaaaaaaaaaaaaaaaa!';

      const result = executeSafeRegex({
        pattern: evilPattern,
        input: evilPayload,
        timeoutMs: 25,
        autoRewrite: false
      });

      expect(result.timedOut).toBe(true);
      expect(result.matched).toBe(false);
      expect(result.actionTaken).toBe(RegexSanitizationAction.EXECUTION_TIMED_OUT);
      expect(result.executionTimeMs).toBeLessThan(150);
    });

    it('deve aplicar reescrita segura automática quando autoRewrite=true em padrão com quantificador aninhado', () => {
      const evilPattern = '(a+)+$';
      const input = 'aaaaaaaaaa';

      const result = executeSafeRegex({
        pattern: evilPattern,
        input,
        autoRewrite: true
      });

      expect(result.matched).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.actionTaken).toBe(RegexSanitizationAction.REWRITTEN_SAFE);
      expect(result.executedPattern).toBe('a+$');
    });

    it('deve truncar ou limitar entradas que excedem maxInputLength', () => {
      const longInput = 'a'.repeat(30000);
      const result = executeSafeRegex({
        pattern: '^a+$',
        input: longInput,
        maxInputLength: 5000
      });

      expect(result.inputLength).toBe(5000);
      expect(result.matched).toBe(true);
    });
  });

  describe('Selo Probatório WORM RFC 8785 & Integridade Criptográfica', () => {
    it('deve gerar selo probatório com HMAC-SHA256 válido', () => {
      const pattern = '^[0-9A-Z]{4}$';
      const input = '6A70';
      const analysis = analyzeRegexComplexity(pattern);
      const execution = executeSafeRegex({ pattern, input });

      const seal = createRedosProofSeal({
        pattern,
        input,
        analysis,
        execution
      });

      expect(seal.version).toBe('1.0.0');
      expect(seal.sealId).toStartWith('redos_seal_');
      expect(seal.patternHash).toBeDefined();
      expect(seal.inputHash).toBeDefined();
      expect(seal.hmacSignature).toBeDefined();
      expect(seal.hmacSignature.length).toBe(64);

      const isValid = verifyRedosProofSeal(seal);
      expect(isValid).toBe(true);
    });

    it('deve rejeitar selo adulterado em qualquer campo', () => {
      const pattern = '^[0-9A-Z]{4}$';
      const input = '6A70';
      const analysis = analyzeRegexComplexity(pattern);
      const execution = executeSafeRegex({ pattern, input });

      const seal = createRedosProofSeal({
        pattern,
        input,
        analysis,
        execution
      });

      // Adulteração do complexity
      const tamperedSeal = {
        ...seal,
        complexity: RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL
      };

      expect(verifyRedosProofSeal(tamperedSeal)).toBe(false);
    });

    it('deve rejeitar selo validado com chave secreta incorreta', () => {
      const pattern = '^\\d+$';
      const input = '12345';
      const analysis = analyzeRegexComplexity(pattern);
      const execution = executeSafeRegex({ pattern, input });

      const seal = createRedosProofSeal({
        pattern,
        input,
        analysis,
        execution,
        secret: 'chave_secreta_A'
      });

      expect(verifyRedosProofSeal(seal, 'chave_secreta_B')).toBe(false);
      expect(verifyRedosProofSeal(seal, 'chave_secreta_A')).toBe(true);
    });
  });
});
