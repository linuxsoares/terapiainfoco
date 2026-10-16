import { describe, it, expect } from 'bun:test';
import {
  tokenizeExpression,
  inspectExpressionSecurity,
  evaluateAstNode,
  evaluateClinicalExpression,
  createExpressionProofSeal,
  verifyExpressionProofSeal,
  DEFAULT_EXPRESSION_GUARD_POLICY,
  DEFAULT_ALLOWED_CLINICAL_FIELDS,
  CLINICAL_RECORDS_MOCK,
  PENTEST_ATTACK_PRESETS,
} from '../src/expressionInjectionGuard';
import {
  ExpressionRiskSeverity,
  ExpressionThreatCategory,
  ExpressionValidationAction,
  ExpressionFilterDialect,
} from '@terapiainfoco/shared';

describe('Módulo 70: Code/Expression Injection Guard & AST Sandboxed Engine (CWE-94, CWE-95 & ASVS V5.2)', () => {
  describe('1. Tokenizador Léxico Seguro (Deterministic Lexer)', () => {
    it('deve tokenizar corretamente identificadores, literais, operadores e agrupamentos', () => {
      const expr = "cid11 == '6A70' && (riskLevel == 'CRITICAL' || attended == true)";
      const { tokens, error } = tokenizeExpression(expr);

      expect(error).toBeUndefined();
      expect(tokens.length).toBeGreaterThan(5);

      const idents = tokens.filter((t) => t.type === 'IDENTIFIER').map((t) => t.value);
      expect(idents).toContain('cid11');
      expect(idents).toContain('riskLevel');
      expect(idents).toContain('attended');

      const strings = tokens.filter((t) => t.type === 'STRING').map((t) => t.value);
      expect(strings).toContain('6A70');
      expect(strings).toContain('CRITICAL');

      const bools = tokens.filter((t) => t.type === 'BOOLEAN').map((t) => t.value);
      expect(bools).toContain(true);
    });

    it('deve tokenizar arrays literais [ ... ] e operadores em texto (AND, OR, NOT, IN, CONTAINS)', () => {
      const expr = "riskLevel IN ['HIGH', 'CRITICAL'] AND tags CONTAINS 'suicide_ideation'";
      const { tokens, error } = tokenizeExpression(expr);

      expect(error).toBeUndefined();
      const ops = tokens.filter((t) => t.type === 'OPERATOR').map((t) => t.value);
      expect(ops).toContain('IN');
      expect(ops).toContain('&&');
      expect(ops).toContain('CONTAINS');
    });

    it('deve acusar erro ao encontrar aspas não fechadas', () => {
      const expr = "cid11 == '6A70";
      const { tokens, error } = tokenizeExpression(expr);
      expect(error).toBeDefined();
      expect(error).toContain('Cadeia de caracteres não terminada');
    });

    it('deve acusar erro léxico em caracteres inesperados', () => {
      const expr = "cid11 == '6A70' @ bad";
      const { tokens, error } = tokenizeExpression(expr);
      expect(error).toBeDefined();
      expect(error).toContain("Caractere inesperado '@'");
    });
  });

  describe('2. Parser AST & Verificação de Conformidade Sintática', () => {
    it('deve construir AST válida para consulta de prontuário legítima', () => {
      const expr = "cidCategory == 'DEPRESSION' && severity == 'SEVERE'";
      const result = inspectExpressionSecurity(expr);

      expect(result.isValid).toBe(true);
      expect(result.isSafe).toBe(true);
      expect(result.action).toBe(ExpressionValidationAction.ALLOW_EXECUTION);
      expect(result.severity).toBe(ExpressionRiskSeverity.CLEAN);
      expect(result.astRoot).toBeDefined();
      expect(result.astRoot?.type).toBe('LogicalExpr');
      expect(result.astNodeCount).toBeGreaterThan(0);
      expect(result.astDepth).toBeGreaterThan(0);
      expect(result.seal).toBeDefined();
    });

    it('deve respeitar parênteses e precedência lógica', () => {
      const expr = "(cid11 == '6A70' || cid11 == '6B00') && attended == true";
      const result = inspectExpressionSecurity(expr);

      expect(result.isValid).toBe(true);
      expect(result.astRoot?.type).toBe('LogicalExpr');
      expect(result.astRoot?.operator).toBe('&&');
    });

    it('deve barrar campo fora da whitelist de campos clínicos autorizados', () => {
      const expr = "patientPasswordHash == 'secret'";
      const result = inspectExpressionSecurity(expr);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.UNAUTHORIZED_FIELD_ACCESS)).toBe(true);
      expect(result.threats[0].description).toContain('Campo clínico não autorizado');
    });

    it('deve bloquear expressões que excedem a profundidade máxima da AST', () => {
      // Cria aninhamento profundo de 12 níveis
      const nestedExpr = '((((((((((((cid11 == "6A70"))))))))))))';
      const strictPolicy = { ...DEFAULT_EXPRESSION_GUARD_POLICY, maxAstDepth: 5 };
      const result = inspectExpressionSecurity(nestedExpr, ExpressionFilterDialect.CLINICAL_AST_DSL, strictPolicy);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.description.includes('Profundidade da AST'))).toBe(true);
    });

    it('deve bloquear expressões que excedem a contagem máxima de nós da AST', () => {
      const longExpr = "cid11 == 'A' && cid11 == 'B' && cid11 == 'C' && cid11 == 'D'";
      const smallNodePolicy = { ...DEFAULT_EXPRESSION_GUARD_POLICY, maxAstNodes: 4 };
      const result = inspectExpressionSecurity(longExpr, ExpressionFilterDialect.CLINICAL_AST_DSL, smallNodePolicy);

      expect(result.isValid).toBe(false);
      expect(result.threats.some((t) => t.description.includes('Total de nós na AST'))).toBe(true);
    });
  });

  describe('3. Detecção e Neutralização de Vetores de Ataque (CWE-94 / CWE-95)', () => {
    it('deve bloquear Prototype Pollution (__proto__, constructor, prototype)', () => {
      const attack = "__proto__.polluted = true && cid11 == '6A70'";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.action).toBe(ExpressionValidationAction.BLOCK_ATTACK);
      expect(result.severity).toBe(ExpressionRiskSeverity.CRITICAL);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR)).toBe(true);
    });

    it('deve bloquear acesso a globais e APIs de sistema (process, require, child_process)', () => {
      const attack = "process.exit() || require('child_process').execSync('ls')";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.action).toBe(ExpressionValidationAction.BLOCK_ATTACK);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS)).toBe(true);
    });

    it('deve bloquear execução dinâmica de código (eval, Function, setTimeout)', () => {
      const attack = "eval('alert(1)') == true";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.action).toBe(ExpressionValidationAction.BLOCK_ATTACK);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION)).toBe(true);
    });

    it('deve bloquear injeção em Template Literals (${...}, #{...})', () => {
      const attack = "doctorName == `${process.env.SECRET}`";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.TEMPLATE_LITERAL_INJECTION)).toBe(true);
    });

    it('deve bloquear operadores NoSQL com execução de JavaScript ($where, sleep)', () => {
      const attack = "{ $where: 'sleep(5000); return true;' }";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.NOSQL_CODE_OPERATOR)).toBe(true);
    });

    it('deve bloquear SpEL e reflexão de classes Java (T(...), class.forName)', () => {
      const attack = "T(java.lang.Runtime).getRuntime().exec('id')";
      const result = inspectExpressionSecurity(attack);

      expect(result.isSafe).toBe(false);
      expect(result.threats.some((t) => t.category === ExpressionThreatCategory.SPEL_OGNL_INJECTION)).toBe(true);
    });

    it('deve neutralizar todos os presets do catálogo PENTEST_ATTACK_PRESETS', () => {
      for (const preset of PENTEST_ATTACK_PRESETS) {
        const result = inspectExpressionSecurity(preset.payload);
        expect(result.isSafe).toBe(false);
        expect(result.action).toBe(ExpressionValidationAction.BLOCK_ATTACK);
        expect(result.threats.length).toBeGreaterThan(0);
      }
    });
  });

  describe('4. Avaliador Sandboxed de Prontuários (Zero eval)', () => {
    it('deve filtrar prontuários por CID-11 corretamente (rec_001 e rec_006)', () => {
      const expr = "cid11 == '6A70'";
      const result = evaluateClinicalExpression(expr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(true);
      expect(result.totalRecordsEvaluated).toBe(CLINICAL_RECORDS_MOCK.length);
      expect(result.matchedCount).toBe(2);
      expect(result.matchedRecords.map((r) => r.id)).toEqual(['rec_001', 'rec_006']);
    });

    it('deve filtrar por categoria e atendimento (ANXIETY && attended == true)', () => {
      const expr = "cidCategory == 'ANXIETY' && attended == true";
      const result = evaluateClinicalExpression(expr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(2);
      expect(result.matchedRecords.map((r) => r.id)).toEqual(['rec_002', 'rec_005']);
    });

    it('deve filtrar usando operador IN com múltiplos valores', () => {
      const expr = "riskLevel IN ['HIGH', 'CRITICAL']";
      const result = evaluateClinicalExpression(expr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(3);
      expect(result.matchedRecords.map((r) => r.id)).toEqual(['rec_001', 'rec_003', 'rec_005']);
    });

    it('deve filtrar usando operador CONTAINS em array de tags', () => {
      const expr = "tags CONTAINS 'suicide_ideation'";
      const result = evaluateClinicalExpression(expr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(result.matchedRecords[0].id).toBe('rec_001');
    });

    it('deve filtrar usando operadores relacionais de data (sessionDate >= 2026-03-15)', () => {
      const expr = "sessionDate >= '2026-03-15'";
      const result = evaluateClinicalExpression(expr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(3);
      expect(result.matchedRecords.map((r) => r.id)).toEqual(['rec_004', 'rec_005', 'rec_006']);
    });

    it('deve recusar a execução de expressão com injeção sem tocar nos prontuários', () => {
      const attackExpr = "require('child_process').exec('rm -rf /') || true";
      const result = evaluateClinicalExpression(attackExpr, CLINICAL_RECORDS_MOCK);

      expect(result.success).toBe(false);
      expect(result.totalRecordsEvaluated).toBe(0);
      expect(result.matchedCount).toBe(0);
      expect(result.errorReason).toBeDefined();
    });
  });

  describe('5. Selo Probatório WORM RFC 8785 (HMAC-SHA256)', () => {
    it('deve emitir e verificar selo probatório íntegro', () => {
      const seal = createExpressionProofSeal({
        expression: "cid11 == '6A70'",
        dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
        decision: ExpressionValidationAction.ALLOW_EXECUTION,
        threatsDetected: 0,
        astNodeCount: 3,
        astDepth: 2,
      });

      expect(seal.sealId).toBeDefined();
      expect(seal.expressionHash).toBeDefined();
      expect(seal.hmacSignature).toHaveLength(64);

      const verification = verifyExpressionProofSeal(seal);
      expect(verification.isValid).toBe(true);
    });

    it('deve rejeitar selo probatório com assinatura inválida ou adulterada', () => {
      const seal = createExpressionProofSeal({
        expression: "cid11 == '6A70'",
        dialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
        decision: ExpressionValidationAction.ALLOW_EXECUTION,
        threatsDetected: 0,
        astNodeCount: 3,
        astDepth: 2,
      });

      // Adulteração de dados
      const tamperedSeal = { ...seal, hmacSignature: 'bad' };
      const verification = verifyExpressionProofSeal(tamperedSeal);
      expect(verification.isValid).toBe(false);
    });
  });

  describe('6. Catálogo de Campos e Presets Clínicos', () => {
    it('deve conter todos os campos padrão na whitelist clínica', () => {
      expect(DEFAULT_ALLOWED_CLINICAL_FIELDS).toContain('cid11');
      expect(DEFAULT_ALLOWED_CLINICAL_FIELDS).toContain('riskLevel');
      expect(DEFAULT_ALLOWED_CLINICAL_FIELDS).toContain('severity');
      expect(DEFAULT_ALLOWED_CLINICAL_FIELDS).toContain('attended');
      expect(DEFAULT_ALLOWED_CLINICAL_FIELDS).toContain('tags');
    });

    it('deve disponibilizar amostras variadas de prontuários com CIDs de saúde mental', () => {
      expect(CLINICAL_RECORDS_MOCK.length).toBeGreaterThanOrEqual(5);
      const cids = CLINICAL_RECORDS_MOCK.map((r) => r.cid11);
      expect(cids).toContain('6A70'); // Depressão
      expect(cids).toContain('6B00'); // Ansiedade
      expect(cids).toContain('6A60'); // Bipolar
    });
  });
});
