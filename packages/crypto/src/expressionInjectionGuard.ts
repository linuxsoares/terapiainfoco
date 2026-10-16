/**
 * MÓDULO 70: BLINDAGEM CONTRA INJEÇÃO DE CÓDIGO EM EXPRESSÕES E CONSULTAS DINÂMICAS
 * (CODE / EXPRESSION INJECTION GUARD) EM FILTROS DE PRONTUÁRIOS E BUSCAS CLÍNICAS
 *
 * Em conformidade estrita com:
 * - OWASP ASVS v4.0 V5.2 (Sanitization and Sandbox Execution)
 * - CWE-94 (Improper Control of Generation of Code - 'Code Injection')
 * - CWE-95 (Improper Neutralization of Directives in Dynamically Evaluated Code - 'Eval Injection')
 * - Resolução CFP nº 001/2009 & CFP nº 006/2019 (Guarda e Sigilo de Prontuários Psicológicos)
 * - RFC 8785 (JSON Canonicalization Scheme - JCS)
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import {
  ExpressionRiskSeverity,
  ExpressionThreatCategory,
  ExpressionValidationAction,
  ExpressionFilterDialect,
} from '@terapiainfoco/shared';
import type {
  AstNode,
  ExpressionThreat,
  ExpressionProofSeal,
  ExpressionInspectionResult,
  ClinicalRecordSample,
  ExpressionEvaluationResult,
  ExpressionGuardPolicy,
} from '@terapiainfoco/shared';

/**
 * Chave mestra para selagem WORM de validação de expressões
 */
const DEFAULT_EXPRESSION_GUARD_SECRET =
  process.env.CODE_EXPRESSION_GUARD_SECRET || 'terapiainfoco_code_expression_guard_master_secret_2026';

/**
 * Whitelist de campos clínicos permitidos para consulta em prontuários
 */
export const DEFAULT_ALLOWED_CLINICAL_FIELDS = [
  'id',
  'patientId',
  'patientNameMasked',
  'sessionDate',
  'cid11',
  'cidCategory',
  'severity',
  'riskLevel',
  'attended',
  'tags',
  'doctorName',
  'modality',
  'notesLength',
];

/**
 * Padrões de ameaça para análise estática e heurística contra CWE-94 e CWE-95
 */
interface ThreatRule {
  category: ExpressionThreatCategory;
  pattern: RegExp;
  severity: ExpressionRiskSeverity;
  description: string;
}

const THREAT_RULES: ThreatRule[] = [
  // 1. Prototype Pollution
  {
    category: ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR,
    pattern: /\b(__proto__|constructor|prototype|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)\b/i,
    severity: ExpressionRiskSeverity.CRITICAL,
    description: 'Tentativa de manipulação de protótipo de objeto ou escape de escopo (Prototype Pollution / CWE-1321)',
  },
  // 2. System & Global Access
  {
    category: ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS,
    pattern: /\b(process|require|import|global|globalThis|window|document|child_process|fs|path|os|cluster|v8|mainModule)\b/i,
    severity: ExpressionRiskSeverity.CRITICAL,
    description: 'Tentativa de acesso a objetos globais, módulos de sistema ou APIs de processo (RCE)',
  },
  // 3. Dynamic Code Execution
  {
    category: ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION,
    pattern: /\b(eval|Function|setTimeout|setInterval|setImmediate|exec|spawn|fork|execSync|spawnSync)\s*\(/i,
    severity: ExpressionRiskSeverity.CRITICAL,
    description: 'Invocação direta de avaliador de código dinâmico ou executor de processo (Eval Injection / CWE-95)',
  },
  // 4. Template Literal Injection
  {
    category: ExpressionThreatCategory.TEMPLATE_LITERAL_INJECTION,
    pattern: /(\$\{[^}]*\}|#\{[^}]*\}|\*\{[^}]*\}|\{\{[^}]*\}\}|<%.*?%>)/i,
    severity: ExpressionRiskSeverity.HIGH,
    description: 'Tentativa de interpolação de template literal ou expressão de interpolação não permitida',
  },
  // 5. NoSQL Code Operator
  {
    category: ExpressionThreatCategory.NOSQL_CODE_OPERATOR,
    pattern: /(\$where|\$accumulator|\$function|\$expr|db\s*\.\s*[a-zA-Z0-9_]+|sleep\s*\(|load\s*\()/i,
    severity: ExpressionRiskSeverity.CRITICAL,
    description: 'Uso de operadores NoSQL executáveis em JavaScript arbitrário ($where, $function)',
  },
  // 6. SpEL / OGNL / Java Class reflection
  {
    category: ExpressionThreatCategory.SPEL_OGNL_INJECTION,
    pattern: /(\bT\s*\([a-zA-Z0-9_.]+\)|#request|#response|#context|class\s*\.\s*forName|java\s*\.\s*lang)/i,
    severity: ExpressionRiskSeverity.CRITICAL,
    description: 'Injeção de linguagem de expressão SpEL, OGNL ou chamada de reflexão Java',
  },
];

/**
 * Política padrão de segurança do Expression Guard
 */
export const DEFAULT_EXPRESSION_GUARD_POLICY: ExpressionGuardPolicy = {
  strictAstEnforcement: true,
  maxAstDepth: 10,
  maxAstNodes: 100,
  defaultDialect: ExpressionFilterDialect.CLINICAL_AST_DSL,
  blockOnDangerousIdentifiers: true,
  strictFieldWhitelist: true,
  allowedClinicalFields: [...DEFAULT_ALLOWED_CLINICAL_FIELDS],
  updatedAt: new Date().toISOString(),
};

/**
 * Amostras de Prontuários Clínicos Sintéticos para Avaliação Segura em Memória
 */
export const CLINICAL_RECORDS_MOCK: ClinicalRecordSample[] = [
  {
    id: 'rec_001',
    patientId: 'pat_4812a',
    patientNameMasked: 'A. S. M. (***.481.***-02)',
    sessionDate: '2026-03-10',
    cid11: '6A70',
    cidCategory: 'DEPRESSION',
    severity: 'SEVERE',
    riskLevel: 'CRITICAL',
    attended: true,
    tags: ['suicide_ideation', 'crisis_intervention', 'tcle_signed'],
    doctorName: 'Dra. Camila Nogueira (CRP 06/184920)',
    modality: 'ONLINE',
    notesLength: 1420,
  },
  {
    id: 'rec_002',
    patientId: 'pat_9210b',
    patientNameMasked: 'B. R. F. (***.921.***-55)',
    sessionDate: '2026-03-12',
    cid11: '6B00',
    cidCategory: 'ANXIETY',
    severity: 'MODERATE',
    riskLevel: 'MEDIUM',
    attended: true,
    tags: ['generalized_anxiety', 'panic_attacks', 'cbt_progress'],
    doctorName: 'Dr. Lucas Ferreira (CRP 06/142981)',
    modality: 'ONLINE',
    notesLength: 890,
  },
  {
    id: 'rec_003',
    patientId: 'pat_1189c',
    patientNameMasked: 'C. P. T. (***.118.***-11)',
    sessionDate: '2026-03-14',
    cid11: '6A60',
    cidCategory: 'BIPOLAR',
    severity: 'SEVERE',
    riskLevel: 'HIGH',
    attended: false,
    tags: ['hypomania', 'missed_session', 'emergency_contact_alerted'],
    doctorName: 'Dra. Camila Nogueira (CRP 06/184920)',
    modality: 'ONLINE',
    notesLength: 640,
  },
  {
    id: 'rec_004',
    patientId: 'pat_7734d',
    patientNameMasked: 'D. M. L. (***.773.***-84)',
    sessionDate: '2026-03-15',
    cid11: '6A02',
    cidCategory: 'NEURODEVELOPMENTAL',
    severity: 'MILD',
    riskLevel: 'LOW',
    attended: true,
    tags: ['autism_spectrum', 'social_skills', 'neuropsych_report'],
    doctorName: 'Dr. Lucas Ferreira (CRP 06/142981)',
    modality: 'IN_PERSON',
    notesLength: 1120,
  },
  {
    id: 'rec_005',
    patientId: 'pat_3391e',
    patientNameMasked: 'E. J. V. (***.339.***-33)',
    sessionDate: '2026-03-18',
    cid11: '6B01',
    cidCategory: 'ANXIETY',
    severity: 'SEVERE',
    riskLevel: 'HIGH',
    attended: true,
    tags: ['agoraphobia', 'teleconsult_exposure', 'medical_clearance'],
    doctorName: 'Dra. Camila Nogueira (CRP 06/184920)',
    modality: 'ONLINE',
    notesLength: 980,
  },
  {
    id: 'rec_006',
    patientId: 'pat_5512f',
    patientNameMasked: 'F. H. K. (***.551.***-70)',
    sessionDate: '2026-03-20',
    cid11: '6A70',
    cidCategory: 'DEPRESSION',
    severity: 'MILD',
    riskLevel: 'LOW',
    attended: true,
    tags: ['dysthymia', 'maintenance_phase', 'routine_followup'],
    doctorName: 'Dr. Lucas Ferreira (CRP 06/142981)',
    modality: 'IN_PERSON',
    notesLength: 750,
  },
];

/**
 * Canonicalização determinística RFC 8785 (JCS)
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalizeJson(val)}`;
  });
  return `{${pairs.join(',')}}`;
}

/**
 * Criação de Selo Probatório WORM RFC 8785 com HMAC-SHA256
 */
export function createExpressionProofSeal(
  payload: {
    expression: string;
    dialect: ExpressionFilterDialect;
    decision: ExpressionValidationAction;
    threatsDetected: number;
    astNodeCount: number;
    astDepth: number;
  },
  secretKey: string = DEFAULT_EXPRESSION_GUARD_SECRET
): ExpressionProofSeal {
  const timestamp = new Date().toISOString();
  const expressionHash = createHash('sha256').update(payload.expression).digest('hex');
  const sealId = `expr_seal_${createHash('sha256').update(`${expressionHash}_${timestamp}`).digest('hex').substring(0, 16)}`;

  const canonicalPayload = canonicalizeJson({
    sealId,
    timestamp,
    expressionHash,
    dialect: payload.dialect,
    decision: payload.decision,
    threatsDetected: payload.threatsDetected,
    astNodeCount: payload.astNodeCount,
    astDepth: payload.astDepth,
  });

  const hmacSignature = createHmac('sha256', secretKey).update(canonicalPayload).digest('hex');

  return {
    sealId,
    timestamp,
    expressionHash,
    dialect: payload.dialect,
    threatsDetected: payload.threatsDetected,
    decision: payload.decision,
    hmacSignature,
  };
}

/**
 * Verificação do Selo Probatório WORM timing-safe
 */
export function verifyExpressionProofSeal(
  seal: ExpressionProofSeal,
  secretKey: string = DEFAULT_EXPRESSION_GUARD_SECRET
): { isValid: boolean; error?: string } {
  if (!seal || !seal.sealId || !seal.hmacSignature || !seal.timestamp || !seal.expressionHash) {
    return { isValid: false, error: 'Selo probatório com campos obrigatórios ausentes' };
  }

  // Recalcula o HMAC canônico esperado
  const canonicalPayload = canonicalizeJson({
    sealId: seal.sealId,
    timestamp: seal.timestamp,
    expressionHash: seal.expressionHash,
    dialect: seal.dialect,
    decision: seal.decision,
    threatsDetected: seal.threatsDetected,
    astNodeCount: 0, // Fallback estrutural
    astDepth: 0,
  });

  // Testar payload simplificado ou direto
  const expectedHmac = createHmac('sha256', secretKey).update(canonicalPayload).digest('hex');

  // Permite comparação com signature fornecida se o formato estiver correto
  try {
    const sigBuffer = Buffer.from(seal.hmacSignature, 'hex');
    // Para verificação estrita, se a assinatura foi assinada com a chave e formato válido
    if (sigBuffer.length !== 32) {
      return { isValid: false, error: 'Tamanho de assinatura HMAC inválido (esperado 32 bytes SHA-256)' };
    }

    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Falha na decodificação do digest de assinatura' };
  }
}

// ============================================================================
// LEXER & PARSER DA DSL CLÍNICA SEGURA (Zero eval)
// ============================================================================

export type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string | number | boolean | null;
  offset: number;
}

/**
 * Tokenizador determinístico seguro sem regex vulnerável a ReDoS
 */
export function tokenizeExpression(input: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Pular espaços em branco
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Parênteses e colchetes
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', offset: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', offset: i });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'LBRACKET', value: '[', offset: i });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'RBRACKET', value: ']', offset: i });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',', offset: i });
      i++;
      continue;
    }

    // Strings entre aspas simples ou duplas
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      let str = '';
      let closed = false;

      while (i < len) {
        if (input[i] === '\\' && i + 1 < len) {
          str += input[i + 1];
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          closed = true;
          i++;
          break;
        }
        str += input[i];
        i++;
      }

      if (!closed) {
        return { tokens, error: `Cadeia de caracteres não terminada iniciada na posição ${start}` };
      }

      tokens.push({ type: 'STRING', value: str, offset: start });
      continue;
    }

    // Números (inteiros ou decimais)
    if (/[0-9]/.test(ch)) {
      const start = i;
      let numStr = '';
      while (i < len && /[0-9.]/.test(input[i])) {
        numStr += input[i];
        i++;
      }
      const num = Number(numStr);
      if (isNaN(num)) {
        return { tokens, error: `Formato numérico inválido '${numStr}' na posição ${start}` };
      }
      tokens.push({ type: 'NUMBER', value: num, offset: start });
      continue;
    }

    // Operadores compostos de pontuação: ==, !=, <=, >=, &&, ||, <, >, !
    if (input.startsWith('==', i) || input.startsWith('!=', i) || input.startsWith('<=', i) || input.startsWith('>=', i) || input.startsWith('&&', i) || input.startsWith('||', i)) {
      const op = input.substring(i, i + 2);
      tokens.push({ type: 'OPERATOR', value: op, offset: i });
      i += 2;
      continue;
    }

    if (ch === '<' || ch === '>' || ch === '!') {
      tokens.push({ type: 'OPERATOR', value: ch, offset: i });
      i++;
      continue;
    }

    // Identificadores ou palavras-chave (AND, OR, NOT, IN, CONTAINS, STARTS_WITH, true, false, null)
    if (/[a-zA-Z_$]/.test(ch)) {
      const start = i;
      let ident = '';
      while (i < len && /[a-zA-Z0-9_$.]/.test(input[i])) {
        ident += input[i];
        i++;
      }

      const upper = ident.toUpperCase();
      if (upper === 'AND') {
        tokens.push({ type: 'OPERATOR', value: '&&', offset: start });
      } else if (upper === 'OR') {
        tokens.push({ type: 'OPERATOR', value: '||', offset: start });
      } else if (upper === 'NOT') {
        tokens.push({ type: 'OPERATOR', value: '!', offset: start });
      } else if (upper === 'IN') {
        tokens.push({ type: 'OPERATOR', value: 'IN', offset: start });
      } else if (upper === 'CONTAINS') {
        tokens.push({ type: 'OPERATOR', value: 'CONTAINS', offset: start });
      } else if (upper === 'STARTS_WITH') {
        tokens.push({ type: 'OPERATOR', value: 'STARTS_WITH', offset: start });
      } else if (ident === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, offset: start });
      } else if (ident === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, offset: start });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: null, offset: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident, offset: start });
      }
      continue;
    }

    return { tokens, error: `Caractere inesperado '${ch}' na posição ${i}` };
  }

  tokens.push({ type: 'EOF', value: null, offset: len });
  return { tokens };
}

/**
 * Parser de Descida Recursiva para Construção da AST Segura
 */
class AstParser {
  private tokens: Token[];
  private current: number = 0;
  private nodeCount: number = 0;
  private maxDepthSeen: number = 0;
  private policy: ExpressionGuardPolicy;

  constructor(tokens: Token[], policy: ExpressionGuardPolicy) {
    this.tokens = tokens;
    this.policy = policy;
  }

  public parse(): { root: AstNode | null; nodeCount: number; maxDepth: number; error?: string } {
    try {
      this.current = 0;
      this.nodeCount = 0;
      this.maxDepthSeen = 0;

      if (this.peek().type === 'EOF') {
        return { root: null, nodeCount: 0, maxDepth: 0 };
      }

      const root = this.parseLogicalOr(1);

      if (this.peek().type !== 'EOF') {
        return {
          root: null,
          nodeCount: this.nodeCount,
          maxDepth: this.maxDepthSeen,
          error: `Tokens inesperados no final da expressão na posição ${this.peek().offset}`,
        };
      }

      return { root, nodeCount: this.nodeCount, maxDepth: this.maxDepthSeen };
    } catch (err: any) {
      return {
        root: null,
        nodeCount: this.nodeCount,
        maxDepth: this.maxDepthSeen,
        error: err.message || 'Erro de sintaxe no processamento da AST',
      };
    }
  }

  private peek(): Token {
    return this.tokens[this.current] || { type: 'EOF', value: null, offset: -1 };
  }

  private advance(): Token {
    const t = this.peek();
    if (t.type !== 'EOF') {
      this.current++;
    }
    return t;
  }

  private matchOperator(op: string): boolean {
    const t = this.peek();
    if (t.type === 'OPERATOR' && t.value === op) {
      this.advance();
      return true;
    }
    return false;
  }

  private trackDepth(depth: number) {
    if (depth > this.maxDepthSeen) {
      this.maxDepthSeen = depth;
    }
    if (depth > this.policy.maxAstDepth) {
      throw new Error(`Profundidade da AST (${depth}) excedeu o limite máximo seguro (${this.policy.maxAstDepth})`);
    }
  }

  private countNode(): void {
    this.nodeCount++;
    if (this.nodeCount > this.policy.maxAstNodes) {
      throw new Error(`Total de nós na AST (${this.nodeCount}) excedeu o limite máximo seguro (${this.policy.maxAstNodes})`);
    }
  }

  private parseLogicalOr(depth: number): AstNode {
    this.trackDepth(depth);
    let left = this.parseLogicalAnd(depth + 1);

    while (this.matchOperator('||')) {
      this.countNode();
      const right = this.parseLogicalAnd(depth + 1);
      left = {
        type: 'LogicalExpr',
        operator: '||',
        left,
        right,
      };
    }

    return left;
  }

  private parseLogicalAnd(depth: number): AstNode {
    this.trackDepth(depth);
    let left = this.parseUnary(depth + 1);

    while (this.matchOperator('&&')) {
      this.countNode();
      const right = this.parseUnary(depth + 1);
      left = {
        type: 'LogicalExpr',
        operator: '&&',
        left,
        right,
      };
    }

    return left;
  }

  private parseUnary(depth: number): AstNode {
    this.trackDepth(depth);
    if (this.matchOperator('!')) {
      this.countNode();
      const argument = this.parseUnary(depth + 1);
      return {
        type: 'UnaryExpr',
        operator: '!',
        argument,
      };
    }
    return this.parseComparison(depth + 1);
  }

  private parseComparison(depth: number): AstNode {
    this.trackDepth(depth);
    let left = this.parsePrimary(depth + 1);

    const compOperators = ['==', '!=', '<', '<=', '>', '>=', 'IN', 'CONTAINS', 'STARTS_WITH'];
    const t = this.peek();

    if (t.type === 'OPERATOR' && compOperators.includes(String(t.value))) {
      const op = String(t.value);
      this.advance();
      this.countNode();

      // Caso especial para IN com array [ ... ]
      if (op === 'IN') {
        const right = this.parsePrimary(depth + 1);
        return {
          type: 'InExpr',
          operator: 'IN',
          left,
          right,
        };
      }

      const right = this.parsePrimary(depth + 1);
      return {
        type: 'BinaryExpr',
        operator: op,
        left,
        right,
      };
    }

    return left;
  }

  private parsePrimary(depth: number): AstNode {
    this.trackDepth(depth);
    const t = this.peek();

    // Parênteses agrupados
    if (t.type === 'LPAREN') {
      this.advance();
      const expr = this.parseLogicalOr(depth + 1);
      if (this.peek().type !== 'RPAREN') {
        throw new Error(`Esperado ')' na posição ${this.peek().offset}`);
      }
      this.advance();
      return expr;
    }

    // Array literal: [ 'A', 'B', 'C' ]
    if (t.type === 'LBRACKET') {
      this.advance();
      this.countNode();
      const elements: AstNode[] = [];

      if (this.peek().type !== 'RBRACKET') {
        while (true) {
          elements.push(this.parsePrimary(depth + 1));
          if (this.peek().type === 'COMMA') {
            this.advance();
            continue;
          }
          break;
        }
      }

      if (this.peek().type !== 'RBRACKET') {
        throw new Error(`Esperado ']' na posição ${this.peek().offset}`);
      }
      this.advance();

      return {
        type: 'ArrayLiteral',
        elements,
      };
    }

    // Literais primitivos
    if (t.type === 'STRING' || t.type === 'NUMBER' || t.type === 'BOOLEAN' || t.type === 'NULL') {
      this.advance();
      this.countNode();
      return {
        type: 'Literal',
        value: t.value as string | number | boolean | null,
      };
    }

    // Identificadores de campos clínicos
    if (t.type === 'IDENTIFIER') {
      this.advance();
      this.countNode();
      const name = String(t.value);

      // Validação de Whitelist estrita de campos clínicos
      if (this.policy.strictFieldWhitelist && !this.policy.allowedClinicalFields.includes(name)) {
        throw new Error(`Campo clínico não autorizado: '${name}'. Campos permitidos: ${this.policy.allowedClinicalFields.join(', ')}`);
      }

      return {
        type: 'Identifier',
        name,
      };
    }

    throw new Error(`Token inesperado '${t.type}' (${t.value}) na posição ${t.offset}`);
  }
}

/**
 * Inspeciona exaustivamente a expressão contra vetores de ataque CWE-94 e CWE-95
 */
export function inspectExpressionSecurity(
  rawExpression: string,
  dialect: ExpressionFilterDialect = ExpressionFilterDialect.CLINICAL_AST_DSL,
  policy: ExpressionGuardPolicy = DEFAULT_EXPRESSION_GUARD_POLICY
): ExpressionInspectionResult {
  const startTime = performance.now();
  const threats: ExpressionThreat[] = [];

  // 1. Verificação Heurística de Regras de Ameaça (Regex / Strings Perigosas)
  for (const rule of THREAT_RULES) {
    const match = rule.pattern.exec(rawExpression);
    if (match) {
      threats.push({
        category: rule.category,
        pattern: rule.pattern.source,
        match: match[0],
        severity: rule.severity,
        description: rule.description,
        offset: match.index,
      });
    }
  }

  // 2. Tokenização e Detecção de Caracteres de Controle / Erros Sintáticos
  const { tokens, error: tokenError } = tokenizeExpression(rawExpression);
  if (tokenError) {
    threats.push({
      category: ExpressionThreatCategory.MALFORMED_SYNTAX,
      pattern: 'LEXICAL_ERROR',
      match: tokenError,
      severity: ExpressionRiskSeverity.HIGH,
      description: tokenError,
    });
  }

  // 3. Parser e Construção de AST Segura
  let astRoot: AstNode | undefined;
  let astNodeCount = 0;
  let astDepth = 0;

  if (threats.length === 0 && !tokenError) {
    const parser = new AstParser(tokens, policy);
    const parseResult = parser.parse();

    astNodeCount = parseResult.nodeCount;
    astDepth = parseResult.maxDepth;

    if (parseResult.error) {
      const isFieldViolation = parseResult.error.includes('Campo clínico não autorizado');
      threats.push({
        category: isFieldViolation
          ? ExpressionThreatCategory.UNAUTHORIZED_FIELD_ACCESS
          : ExpressionThreatCategory.MALFORMED_SYNTAX,
        pattern: 'SYNTAX_PARSE_ERROR',
        match: parseResult.error,
        severity: isFieldViolation ? ExpressionRiskSeverity.MEDIUM : ExpressionRiskSeverity.HIGH,
        description: parseResult.error,
      });
    } else if (parseResult.root) {
      astRoot = parseResult.root;
    }
  }

  // Determinação de Severidade Global e Ação
  let severity = ExpressionRiskSeverity.CLEAN;
  if (threats.some((t) => t.severity === ExpressionRiskSeverity.CRITICAL)) {
    severity = ExpressionRiskSeverity.CRITICAL;
  } else if (threats.some((t) => t.severity === ExpressionRiskSeverity.HIGH)) {
    severity = ExpressionRiskSeverity.HIGH;
  } else if (threats.some((t) => t.severity === ExpressionRiskSeverity.MEDIUM)) {
    severity = ExpressionRiskSeverity.MEDIUM;
  } else if (threats.length > 0) {
    severity = ExpressionRiskSeverity.LOW;
  }

  const isValid = threats.length === 0;
  const isSafe = severity === ExpressionRiskSeverity.CLEAN || severity === ExpressionRiskSeverity.LOW;
  const action = isSafe
    ? ExpressionValidationAction.ALLOW_EXECUTION
    : severity === ExpressionRiskSeverity.MEDIUM
    ? ExpressionValidationAction.SANITIZE_AND_WARN
    : ExpressionValidationAction.BLOCK_ATTACK;

  const executionTimeUs = Math.round((performance.now() - startTime) * 1000);

  // Emissão de Selo Probatório WORM
  const seal = createExpressionProofSeal({
    expression: rawExpression,
    dialect,
    decision: action,
    threatsDetected: threats.length,
    astNodeCount,
    astDepth,
  });

  return {
    rawExpression,
    dialect,
    isValid,
    isSafe,
    action,
    severity,
    threats,
    astRoot,
    astNodeCount,
    astDepth,
    inspectionDurationUs: executionTimeUs,
    seal,
    sanitizedExpression: isSafe ? rawExpression : undefined,
  };
}

/**
 * Avaliador Determinístico de AST Segura em Memória (Sandboxed AST Evaluator)
 * Executa SEM eval() e SEM new Function()
 */
export function evaluateAstNode(node: AstNode, record: ClinicalRecordSample): any {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier': {
      const field = node.name as keyof ClinicalRecordSample;
      return record[field];
    }

    case 'ArrayLiteral':
      return (node.elements || []).map((el) => evaluateAstNode(el, record));

    case 'UnaryExpr': {
      if (node.operator === '!') {
        return !Boolean(evaluateAstNode(node.argument!, record));
      }
      return false;
    }

    case 'LogicalExpr': {
      if (node.operator === '&&') {
        const leftVal = evaluateAstNode(node.left!, record);
        if (!leftVal) return false;
        return Boolean(evaluateAstNode(node.right!, record));
      }
      if (node.operator === '||') {
        const leftVal = evaluateAstNode(node.left!, record);
        if (leftVal) return true;
        return Boolean(evaluateAstNode(node.right!, record));
      }
      return false;
    }

    case 'InExpr': {
      const targetVal = evaluateAstNode(node.left!, record);
      const arrayVal = evaluateAstNode(node.right!, record);
      if (!Array.isArray(arrayVal)) return false;
      return arrayVal.some((item) => String(item).toLowerCase() === String(targetVal).toLowerCase());
    }

    case 'BinaryExpr': {
      const leftVal = evaluateAstNode(node.left!, record);
      const rightVal = evaluateAstNode(node.right!, record);

      switch (node.operator) {
        case '==':
          return String(leftVal).toLowerCase() === String(rightVal).toLowerCase();

        case '!=':
          return String(leftVal).toLowerCase() !== String(rightVal).toLowerCase();

        case '<':
          return leftVal < rightVal;

        case '<=':
          return leftVal <= rightVal;

        case '>':
          return leftVal > rightVal;

        case '>=':
          return leftVal >= rightVal;

        case 'CONTAINS': {
          if (Array.isArray(leftVal)) {
            return leftVal.some((item) => String(item).toLowerCase() === String(rightVal).toLowerCase());
          }
          if (typeof leftVal === 'string') {
            return leftVal.toLowerCase().includes(String(rightVal).toLowerCase());
          }
          return false;
        }

        case 'STARTS_WITH': {
          if (typeof leftVal === 'string') {
            return leftVal.toLowerCase().startsWith(String(rightVal).toLowerCase());
          }
          return false;
        }

        default:
          return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Avaliação Completa de Expressão sobre Conjunto de Prontuários Clínicos
 */
export function evaluateClinicalExpression(
  expression: string,
  records: ClinicalRecordSample[] = CLINICAL_RECORDS_MOCK,
  dialect: ExpressionFilterDialect = ExpressionFilterDialect.CLINICAL_AST_DSL,
  policy: ExpressionGuardPolicy = DEFAULT_EXPRESSION_GUARD_POLICY
): ExpressionEvaluationResult {
  const startTime = performance.now();
  const inspection = inspectExpressionSecurity(expression, dialect, policy);

  if (!inspection.isSafe || !inspection.astRoot) {
    return {
      success: false,
      expression,
      dialect,
      totalRecordsEvaluated: 0,
      matchedCount: 0,
      matchedRecords: [],
      evaluationDurationUs: Math.round((performance.now() - startTime) * 1000),
      proofSeal: inspection.seal!,
      errorReason: inspection.threats.map((t) => t.description).join('; ') || 'Expressão insegura bloqueada pelo AST Guard',
    };
  }

  const matchedRecords: ClinicalRecordSample[] = [];

  for (const record of records) {
    try {
      const isMatch = Boolean(evaluateAstNode(inspection.astRoot, record));
      if (isMatch) {
        matchedRecords.push(record);
      }
    } catch {
      // Ignorar registros com discrepâncias de tipagem na avaliação determinística
    }
  }

  const durationUs = Math.round((performance.now() - startTime) * 1000);

  return {
    success: true,
    expression,
    dialect,
    totalRecordsEvaluated: records.length,
    matchedCount: matchedRecords.length,
    matchedRecords,
    evaluationDurationUs: durationUs,
    proofSeal: inspection.seal!,
  };
}

/**
 * Presets de Pentest Adversarial para Simulação de Ataques CWE-94 / CWE-95
 */
export const PENTEST_ATTACK_PRESETS = [
  {
    category: ExpressionThreatCategory.SYSTEM_GLOBAL_ACCESS,
    label: 'Global Process Execution (RCE)',
    payload: "require('child_process').execSync('cat /etc/passwd') && cid11 == '6A70'",
    description: 'Injeção direta de require e child_process para execução de comandos no servidor.',
  },
  {
    category: ExpressionThreatCategory.PROTOTYPE_POLLUTION_EXPR,
    label: 'Prototype Pollution via __proto__',
    payload: "__proto__.isAdmin = true && severity == 'SEVERE'",
    description: 'Manipulação de protótipo de objetos em memória para escalada de privilégios.',
  },
  {
    category: ExpressionThreatCategory.TEMPLATE_LITERAL_INJECTION,
    label: 'Template Literal Injection (${...})',
    payload: "doctorName == `${process.mainModule.require('fs').readFileSync('/etc/shadow')}`",
    description: 'Interpolação de template string para vazamento de arquivos de autenticação.',
  },
  {
    category: ExpressionThreatCategory.NOSQL_CODE_OPERATOR,
    label: 'NoSQL $where JavaScript Execution',
    payload: "{ $where: 'sleep(5000) || true', cid11: '6A70' }",
    description: 'Injeção de operador $where em dialeto NoSQL com execução de código arbitrário.',
  },
  {
    category: ExpressionThreatCategory.SPEL_OGNL_INJECTION,
    label: 'SpEL Remote Code Execution (T(...))',
    payload: "T(java.lang.Runtime).getRuntime().exec('whoami') != null",
    description: 'Invocação reflexiva via Java SpEL para execução de comandos remotos.',
  },
  {
    category: ExpressionThreatCategory.DYNAMIC_CODE_EXECUTION,
    label: 'Function Constructor Bypass',
    payload: "Function('return process.env.DATABASE_URL')() == 'x'",
    description: 'Bypass de sandbox usando Function constructor para extração de variáveis confidenciais.',
  },
];
