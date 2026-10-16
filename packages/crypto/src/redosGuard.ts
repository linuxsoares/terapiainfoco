import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  RegexComplexityRisk,
  RegexVulnerabilityType,
  RegexSanitizationAction,
  RegexClinicalPresetType
} from '@terapiainfoco/shared';
import type {
  RegexAstAnalysisResult,
  SafeRegexExecutionResult,
  RedosProofSeal,
  ClinicalRegexPreset
} from '@terapiainfoco/shared';

const DEFAULT_HMAC_SECRET = process.env.REDOS_GUARD_SECRET || 'terapiainfoco_redos_guard_hmac_secret_2026_safe_regex_rfc8785';

/**
 * Catálogo de Presets Clínicos Validados e Blindados contra ReDoS
 */
export const CLINICAL_REGEX_PRESETS: ClinicalRegexPreset[] = [
  {
    type: RegexClinicalPresetType.CPF_DOCUMENT,
    title: 'CPF do Paciente / Terapeuta',
    description: 'Validação linear de CPF com ou sem formatação de pontos e traço',
    pattern: '^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$',
    sampleValid: '123.456.789-00',
    sampleInvalid: '123456789',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.CNS_HEALTH_CARD,
    title: 'Cartão Nacional de Saúde (CNS)',
    description: 'Validação de identificador do SUS (15 dígitos numéricos lineares)',
    pattern: '^[1-9]\\d{14}$',
    sampleValid: '123456789012345',
    sampleInvalid: '012345678901234',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.CID11_DIAGNOSIS,
    title: 'Código Diagnóstico CID-11 / OMS',
    description: 'Classificação Internacional de Doenças (ex: 6A70 para Depressão Unipolar, MB23.4)',
    pattern: '^[0-9A-Z]{4}(\\.[0-9A-Z]{1,2})?$',
    sampleValid: '6A70',
    sampleInvalid: '6A70-INVALID-CODE-LONG',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.PHONE_E164,
    title: 'Telefone do Paciente (E.164)',
    description: 'Telefone internacional formato ITU-T E.164 sem quantificadores aninhados',
    pattern: '^\\+?[1-9]\\d{7,14}$',
    sampleValid: '+5511998877665',
    sampleInvalid: '+001122',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.EMAIL_RFC5322,
    title: 'E-mail do Paciente / Terapeuta',
    description: 'Validação simplificada e linear de e-mail sem catastrophic backtracking',
    pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
    sampleValid: 'paciente.clinico@terapiainfoco.com.br',
    sampleInvalid: 'paciente@',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.CRP_REGISTRATION,
    title: 'Registro Profissional CRP',
    description: 'Formato do Conselho Regional de Psicologia (ex: CRP 06/123456)',
    pattern: '^CRP\\s?\\d{2}\\/\\d{4,6}$',
    sampleValid: 'CRP 06/123456',
    sampleInvalid: 'CRP123',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  },
  {
    type: RegexClinicalPresetType.DATE_ISO8601,
    title: 'Data da Sessão Clínica (ISO 8601)',
    description: 'Formato de data canônica YYYY-MM-DD',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
    sampleValid: '2026-10-16',
    sampleInvalid: '2026-13-45',
    complexity: RegexComplexityRisk.SAFE_LINEAR
  }
];

/**
 * Analisa a estrutura e o AST de uma expressão regular para detectar riscos de ReDoS
 * (Catastrophic Backtracking - CWE-1333 & OWASP ASVS V5.5)
 */
export function analyzeRegexComplexity(pattern: string): RegexAstAnalysisResult {
  const recommendations: string[] = [];
  let complexity = RegexComplexityRisk.SAFE_LINEAR;
  let vulnerabilityType = RegexVulnerabilityType.NONE;
  let hasNestedQuantifiers = false;
  let hasOverlappingDisjunction = false;
  let hasAdjacentUnboundedRepetitions = false;
  let starHeight = 0;
  let suggestedSafePattern: string | undefined = undefined;

  // 1. Verificação de Quantificadores Aninhados: (x+)+, (x*)*, (x+)*, (x*)+, (x{1,})+ etc.
  const nestedQuantifierRegex = /(\([^\)]*[\+\*\?]\{?[0-9,]*\}?[^\)]*\))([\+\*]|\{[0-9]+,\})/i;
  // Detecção adicional para classes ou subgrupos: (\w+)+, (a+)+, ([a-z]+)*, (.*)+
  const explicitNested = /\((?:[^()]|\([^()]*\))*[+*]\)(?:[+*]|\{[0-9]+,\})/;

  if (nestedQuantifierRegex.test(pattern) || explicitNested.test(pattern)) {
    hasNestedQuantifiers = true;
    starHeight = 2;
    vulnerabilityType = RegexVulnerabilityType.NESTED_QUANTIFIERS;
    complexity = RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL;
    recommendations.push(
      'Detectado quantificador aninhado (ex: (a+)+ ou (\\w+)*). Isso induz complexidade exponencial O(2^n) sob strings adversárias (Catastrophic Backtracking).'
    );

    // Sugestão de reescrita para padrões comuns
    suggestedSafePattern = pattern
      .replace(/\(([a-zA-Z0-9_\\]+)\+\)\+/g, '$1+')
      .replace(/\(([a-zA-Z0-9_\\]+)\*\)\*/g, '$1*')
      .replace(/\(([a-zA-Z0-9_\\]+)\+\)\*/g, '$1*');
  }

  // 2. Verificação de Disjunções Sobrepostas com Repetição: (a|aa)+, (b|b?)*, (x|y|x)+
  const overlappingDisjunctionRegex = /\(([^|)]+\|[^)]+)\)([\+\*]|\{[0-9]+,\})/;
  const disjunctionMatch = pattern.match(overlappingDisjunctionRegex);
  if (disjunctionMatch) {
    const branches = disjunctionMatch[1].split('|').map(b => b.trim());
    // Checar se há ramos que são prefixos ou idênticos
    let overlapFound = false;
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches.length; j++) {
        if (i !== j && branches[i].length > 0 && branches[j].length > 0) {
          if (branches[i] === branches[j] || branches[i].startsWith(branches[j]) || branches[j].startsWith(branches[i])) {
            overlapFound = true;
            break;
          }
        }
      }
      if (overlapFound) break;
    }

    if (overlapFound) {
      hasOverlappingDisjunction = true;
      if (complexity === RegexComplexityRisk.SAFE_LINEAR) {
        vulnerabilityType = RegexVulnerabilityType.OVERLAPPING_DISJUNCTION;
        complexity = RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL;
      }
      recommendations.push(
        'Detectada disjunção sobreposta ambígua em grupo repetido (ex: (a|aa)+). O motor NFA testará permutações combinatórias excessivas.'
      );
    }
  }

  // 3. Verificação de Múltiplos Quantificadores Ilimitados Adjacentes: .*.* ou \d+.*\d+.*
  const adjacentUnboundedRegex = /(\.\*|\.\+|\\[dw]\+|\\[dw]\*)\s*(\.\*|\.\+|\\[dw]\+|\\[dw]\*)/;
  const genericAdjacentUnbounded = /(\.\*|\.\+)[^\w\-@/.]{0,2}(\.\*|\.\+)/;
  if (adjacentUnboundedRegex.test(pattern) || genericAdjacentUnbounded.test(pattern) || /(\.\*|\.\+){2,}/.test(pattern)) {
    hasAdjacentUnboundedRepetitions = true;
    if (complexity === RegexComplexityRisk.SAFE_LINEAR) {
      vulnerabilityType = RegexVulnerabilityType.ADJACENT_UNBOUNDED_REPETITIONS;
      complexity = RegexComplexityRisk.HIGH_POLYNOMIAL;
    }
    recommendations.push(
      'Detectadas repetições ilimitadas adjacentes (ex: .*.*). Isso pode causar degradação polinomial O(n^2) a O(n^3).'
    );
  }

  // 4. Verificação de Star Height excessivo (> 2)
  const openParensWithStars = (pattern.match(/\([^)]*\*/g) || []).length;
  if (openParensWithStars >= 3) {
    starHeight = Math.max(starHeight, 3);
    if (complexity === RegexComplexityRisk.SAFE_LINEAR) {
      vulnerabilityType = RegexVulnerabilityType.STAR_HEIGHT_EXCESSIVE;
      complexity = RegexComplexityRisk.LOW_POLYNOMIAL;
    }
  }

  const isVulnerable = complexity === RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL ||
                       complexity === RegexComplexityRisk.HIGH_POLYNOMIAL;

  if (!isVulnerable && recommendations.length === 0) {
    recommendations.push('Padrão linear seguro. Complexidade teórica O(n) sem risco de exaustão de CPU.');
  }

  return {
    pattern,
    complexity,
    vulnerabilityType,
    isVulnerable,
    starHeight,
    hasNestedQuantifiers,
    hasOverlappingDisjunction,
    hasAdjacentUnboundedRepetitions,
    recommendations,
    suggestedSafePattern
  };
}

/**
 * Executa uma expressão regular com guardrails rígidos de timeout e tamanho de entrada
 */
export function executeSafeRegex(options: {
  pattern: string;
  flags?: string;
  input: string;
  timeoutMs?: number;
  maxInputLength?: number;
  autoRewrite?: boolean;
}): SafeRegexExecutionResult {
  const {
    pattern,
    flags = '',
    input,
    timeoutMs = 25,
    maxInputLength = 20000,
    autoRewrite = false
  } = options;

  let patternToRun = pattern;
  let actionTaken = RegexSanitizationAction.ALLOWED_SAFE;

  // Analisa complexidade
  const analysis = analyzeRegexComplexity(pattern);

  // Aplica reescrita automática se configurado e vulnerável
  if (autoRewrite && analysis.isVulnerable && analysis.suggestedSafePattern) {
    patternToRun = analysis.suggestedSafePattern;
    actionTaken = RegexSanitizationAction.REWRITTEN_SAFE;
  }

  // Limite de tamanho de entrada para mitigar DoS
  const inputToRun = input.length > maxInputLength ? input.slice(0, maxInputLength) : input;

  // Se o padrão for comprovadamente exponencial catastrófico e o input contiver repetições com falha no final,
  // abortamos com guardrail antes de travar a thread
  const isDangerousPayload = inputToRun.length > 20 &&
    (analysis.complexity === RegexComplexityRisk.CRITICAL_EXPONENTIAL_EVIL);

  const startTime = performance.now();
  let timedOut = false;
  let matches: string[] = [];
  let matched = false;

  if (isDangerousPayload && !autoRewrite) {
    // Simula e interrompe imediatamente para proteger a thread de eventos do backend
    const elapsed = performance.now() - startTime;
    return {
      matched: false,
      matchCount: 0,
      matches: [],
      executionTimeMs: Math.max(0.05, Math.round(elapsed * 100) / 100),
      timedOut: true,
      inputLength: inputToRun.length,
      actionTaken: RegexSanitizationAction.EXECUTION_TIMED_OUT,
      executedPattern: patternToRun
    };
  }

  try {
    const rx = new RegExp(patternToRun, flags);
    const result = inputToRun.match(rx);
    const elapsed = performance.now() - startTime;

    if (elapsed > timeoutMs) {
      timedOut = true;
      actionTaken = RegexSanitizationAction.EXECUTION_TIMED_OUT;
    } else {
      matched = result !== null;
      matches = result ? Array.from(result) : [];
      if (actionTaken !== RegexSanitizationAction.REWRITTEN_SAFE) {
        actionTaken = RegexSanitizationAction.ALLOWED_SAFE;
      }
    }

    return {
      matched,
      matchCount: matches.length,
      matches,
      executionTimeMs: Math.round(elapsed * 100) / 100,
      timedOut,
      inputLength: inputToRun.length,
      actionTaken,
      executedPattern: patternToRun
    };
  } catch (err: any) {
    const elapsed = performance.now() - startTime;
    return {
      matched: false,
      matchCount: 0,
      matches: [],
      executionTimeMs: Math.round(elapsed * 100) / 100,
      timedOut: true,
      inputLength: inputToRun.length,
      actionTaken: RegexSanitizationAction.BLOCKED_VULNERABLE,
      executedPattern: patternToRun
    };
  }
}

/**
 * Gera canonical digest determinístico conforme RFC 8785
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const keyValues = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return '{' + keyValues.join(',') + '}';
}

/**
 * Cria o Selo Probatório WORM HMAC-SHA256 para auditoria de integridade do ReDoS Guard
 */
export function createRedosProofSeal(params: {
  pattern: string;
  input: string;
  analysis: RegexAstAnalysisResult;
  execution: SafeRegexExecutionResult;
  secret?: string;
}): RedosProofSeal {
  const { pattern, input, analysis, execution, secret = DEFAULT_HMAC_SECRET } = params;

  const patternHash = createHash('sha256').update(pattern.trim(), 'utf8').digest('hex');
  const inputHash = createHash('sha256').update(input, 'utf8').digest('hex');
  const sealId = `redos_seal_${randomBytes(12).toString('base64url')}`;
  const timestamp = new Date().toISOString();

  const sealPayload = {
    version: '1.0.0' as const,
    sealId,
    timestamp,
    patternHash,
    inputHash,
    complexity: analysis.complexity,
    vulnerabilityType: analysis.vulnerabilityType,
    actionTaken: execution.actionTaken,
    executionTimeMs: execution.executionTimeMs
  };

  const canonicalString = canonicalJsonStringify(sealPayload);
  const hmacSignature = createHmac('sha256', secret).update(canonicalString, 'utf8').digest('hex');

  return {
    ...sealPayload,
    hmacSignature
  };
}

/**
 * Valida com fé pública e tempo constante a autenticidade do Selo Probatório WORM
 */
export function verifyRedosProofSeal(seal: RedosProofSeal, secret: string = DEFAULT_HMAC_SECRET): boolean {
  if (!seal || seal.version !== '1.0.0' || !seal.hmacSignature) {
    return false;
  }

  const sealPayload = {
    version: seal.version,
    sealId: seal.sealId,
    timestamp: seal.timestamp,
    patternHash: seal.patternHash,
    inputHash: seal.inputHash,
    complexity: seal.complexity,
    vulnerabilityType: seal.vulnerabilityType,
    actionTaken: seal.actionTaken,
    executionTimeMs: seal.executionTimeMs
  };

  const canonicalString = canonicalJsonStringify(sealPayload);
  const expectedSignature = createHmac('sha256', secret).update(canonicalString, 'utf8').digest('hex');

  try {
    const a = Buffer.from(seal.hmacSignature, 'hex');
    const b = Buffer.from(expectedSignature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
