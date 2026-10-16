import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  TemplateRiskSeverity,
  SstiThreatVector,
  SstiSanitizationAction,
  ClinicalDocumentTemplateType
} from '@terapiainfoco/shared';
import type {
  TemplateInspectionResult,
  SandboxedRenderResult,
  SstiProofSeal,
  ClinicalTemplatePreset
} from '@terapiainfoco/shared';

const DEFAULT_HMAC_SECRET = process.env.SSTI_GUARD_SECRET || 'terapiainfoco_ssti_guard_hmac_secret_2026_secure_template_engine_rfc8785';

/**
 * Palavras-chave estritamente proibidas para prevenção de SSTI e Remote Code Execution (CWE-1336)
 */
export const FORBIDDEN_SSTI_PATTERNS = [
  { pattern: /__proto__/i, vector: SstiThreatVector.PROTOTYPE_ACCESS, label: '__proto__ (Prototype Pollution / Chain Tampering)' },
  { pattern: /constructor/i, vector: SstiThreatVector.PROTOTYPE_ACCESS, label: 'constructor (Function Constructor Escape)' },
  { pattern: /prototype/i, vector: SstiThreatVector.PROTOTYPE_ACCESS, label: 'prototype (Object Prototype Access)' },
  { pattern: /\bprocess\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'process (Node.js/Bun Runtime Process Object)' },
  { pattern: /\bglobal(?:This)?\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'global / globalThis (Global Scope Escape)' },
  { pattern: /\bwindow\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'window (DOM Window Context)' },
  { pattern: /\brequire\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'require (Dynamic Module Loader)' },
  { pattern: /\bimport\s*\(/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'import() (Dynamic ES Module Loader)' },
  { pattern: /\beval\s*\(/i, vector: SstiThreatVector.DYNAMIC_EVAL_ATTEMPT, label: 'eval() (Direct Code Evaluation)' },
  { pattern: /\bFunction\s*\(/i, vector: SstiThreatVector.DYNAMIC_EVAL_ATTEMPT, label: 'Function() (Dynamic Constructor Code Execution)' },
  { pattern: /\bsetTimeout\b/i, vector: SstiThreatVector.DYNAMIC_EVAL_ATTEMPT, label: 'setTimeout (Async Timer Injection)' },
  { pattern: /\bmainModule\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'mainModule (Module Traversal RCE)' },
  { pattern: /\bchild_process\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'child_process (OS Command Execution)' },
  { pattern: /\bspawn\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'spawn (Process Spawning)' },
  { pattern: /\bexec\b/i, vector: SstiThreatVector.RUNTIME_GLOBALS_ACCESS, label: 'exec (Shell Execution)' },
  { pattern: /\$\{[^}]*\}/, vector: SstiThreatVector.DELIMITER_INJECTION, label: '${...} (ES6 String Interpolation Injection)' },
  { pattern: /<%.*?%>/, vector: SstiThreatVector.DELIMITER_INJECTION, label: '<%= ... %> (ERB/EJS Delimiter Injection)' }
];

/**
 * Catálogo Oficial de Presets Clínicos Blindados (Resolução CFP nº 006/2019)
 */
export const CLINICAL_TEMPLATE_PRESETS: ClinicalTemplatePreset[] = [
  {
    type: ClinicalDocumentTemplateType.DECLARACAO_PSICOLOGICA,
    title: 'Declaração Psicológica (CFP nº 006/2019, Art. 9º)',
    description: 'Comprova comparecimento e acompanhamento terapêutico sem quebra de sigilo diagnóstico',
    rawTemplate: `DECLARAÇÃO PSICOLÓGICA

Declaro para os devidos fins que o(a) paciente {{pacienteNome}}, inscrito(a) no CPF sob o nº {{pacienteCpf}}, compareceu à sessão de atendimento psicológico no dia {{dataSessao}}, no horário das {{horarioSessao}}, sob meus cuidados profissionais.

Esta declaração tem validade de comparecimento e não expõe diagnósticos clínicos em observância ao Código de Ética Profissional do Psicólogo.

{{cidade}}, {{dataEmissao}}

___________________________________________________
{{terapeutaNome}}
Psicólogo(a) Clínico(a) — CRP: {{terapeutaCrp}}`,
    defaultVariables: {
      pacienteNome: 'João da Silva Santos',
      pacienteCpf: '123.456.789-00',
      dataSessao: '16/10/2026',
      horarioSessao: '14:30',
      cidade: 'São Paulo - SP',
      dataEmissao: '16 de outubro de 2026',
      terapeutaNome: 'Dra. Helena Vasconcelos',
      terapeutaCrp: '06/123456'
    },
    sampleOutput: ''
  },
  {
    type: ClinicalDocumentTemplateType.ATESTADO_PSICOLOGICO,
    title: 'Atestado Psicológico (CFP nº 006/2019, Art. 10º)',
    description: 'Atesta aptidão, justificativa ou condições psicológicas com CID-11 protegido',
    rawTemplate: `ATESTADO PSICOLÓGICO

Atesto, para fins de {{finalidadeAtestado}}, que o(a) paciente {{pacienteNome}}, CPF nº {{pacienteCpf}}, encontra-se em acompanhamento psicológico regular, apresentando condições compatíveis com a demanda apresentada.

Classificação Internacional de Doenças (CID-11): {{cid11}}
Recomendação Terapêutica: {{recomendacao}}

{{cidade}}, {{dataEmissao}}

___________________________________________________
{{terapeutaNome}} — CRP: {{terapeutaCrp}}`,
    defaultVariables: {
      finalidadeAtestado: 'afastamento laboral temporário para suporte emocional',
      pacienteNome: 'Maria Clara Mendonça',
      pacienteCpf: '987.654.321-99',
      cid11: '6A70 (Transtorno Depressivo de Episódio Único)',
      recomendacao: 'Manutenção de sessões semanais e repouso por 5 dias',
      cidade: 'Rio de Janeiro - RJ',
      dataEmissao: '16 de outubro de 2026',
      terapeutaNome: 'Dr. Roberto Magalhães',
      terapeutaCrp: '05/987654'
    },
    sampleOutput: ''
  },
  {
    type: ClinicalDocumentTemplateType.RELATORIO_PSICOLOGICO,
    title: 'Relatório Psicológico (CFP nº 006/2019, Art. 11º)',
    description: 'Documento fundamentado com síntese biopsicossocial e objetivos de intervenção',
    rawTemplate: `RELATÓRIO PSICOLÓGICO

1. IDENTIFICAÇÃO DO PACIENTE:
Nome: {{pacienteNome}} | CPF: {{pacienteCpf}} | Data de Nascimento: {{pacienteDataNasc}}

2. DEMANDA & QUEIXA PRINCIPAL:
{{demandaPrincipal}}

3. PROCEDIMENTOS TÉCNICOS:
Foram realizadas {{numeroSessoes}} sessões estruturadas na abordagem cognitivo-comportamental, aplicando entrevistas e registros sistemáticos.

4. CONCLUSÃO & ENCAMINHAMENTO:
{{conclusaoIntervencao}}

{{cidade}}, {{dataEmissao}}
{{terapeutaNome}} — CRP: {{terapeutaCrp}}`,
    defaultVariables: {
      pacienteNome: 'Carlos Eduardo Oliveira',
      pacienteCpf: '456.789.012-34',
      pacienteDataNasc: '12/04/1988',
      demandaPrincipal: 'Sintomatologia ansiosa generalizada e insônia crônica associada ao ambiente de trabalho.',
      numeroSessoes: '12',
      conclusaoIntervencao: 'Observa-se evolução satisfatória na regulação emocional e aquisição de técnicas de enfrentamento cognitivo.',
      cidade: 'Belo Horizonte - MG',
      dataEmissao: '16 de outubro de 2026',
      terapeutaNome: 'Dra. Camila Alencar',
      terapeutaCrp: '04/654321'
    },
    sampleOutput: ''
  },
  {
    type: ClinicalDocumentTemplateType.TERMO_CONSENTIMENTO,
    title: 'Termo de Consentimento Livre e Esclarecido (TCLE - LGPD Art. 7º/11)',
    description: 'Formalização de consentimento expresso e autorização de tratamento de dados clínicos',
    rawTemplate: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)

Eu, {{pacienteNome}}, portador(a) do CPF nº {{pacienteCpf}}, declaro que fui devidamente informado(a) pelo(a) terapeuta {{terapeutaNome}} (CRP: {{terapeutaCrp}}) sobre a metodologia dos atendimentos psicológicos, o sigilo profissional assegurado pelo Código de Ética e a proteção de dados conforme a LGPD (Lei 13.709/2018).

Data de Consentimento: {{dataConsentimento}}
Canal de Atendimento: {{canalAtendimento}}

Assinatura Digital do Paciente: {{pacienteNome}}`,
    defaultVariables: {
      pacienteNome: 'Luciana Ferreira Rocha',
      pacienteCpf: '321.654.987-11',
      terapeutaNome: 'Dra. Helena Vasconcelos',
      terapeutaCrp: '06/123456',
      dataConsentimento: '16/10/2026',
      canalAtendimento: 'Telepsicologia Criptografada WebRTC E2EE'
    },
    sampleOutput: ''
  }
];

/**
 * Escapa caracteres HTML/Markdown especiais para prevenir injeções downstream (XSS)
 */
export function escapeTemplateOutput(str: string): string {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Inspeciona léxica e estruturalmente o template buscando vetores de SSTI e escape de sandbox
 */
export function inspectTemplate(
  templateContent: string,
  allowedVariables?: string[]
): TemplateInspectionResult {
  const detectedThreats: string[] = [];
  const allowedVariablesUsed: string[] = [];
  const forbiddenVariablesBlocked: string[] = [];
  let riskSeverity = TemplateRiskSeverity.SAFE_STATIC;
  let threatVector = SstiThreatVector.NONE;

  // 1. Verificação contra padrões proibidos de SSTI
  for (const forbidden of FORBIDDEN_SSTI_PATTERNS) {
    if (forbidden.pattern.test(templateContent)) {
      detectedThreats.push(forbidden.label);
      if (threatVector === SstiThreatVector.NONE) {
        threatVector = forbidden.vector;
      }
      riskSeverity = TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT;
    }
  }

  // 2. Extração de variáveis sintáticas {{variavel}}
  const tagRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(templateContent)) !== null) {
    const rawExpression = match[1].trim();

    // Checar se a expressão contém caracteres ilegais para nomes de variáveis
    if (!/^[a-zA-Z0-9_.]+$/.test(rawExpression)) {
      detectedThreats.push(`Expressão dinâmica não-identificadora rejeitada: {{${rawExpression}}}`);
      if (riskSeverity !== TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT) {
        riskSeverity = TemplateRiskSeverity.SUSPICIOUS_EXPRESSION;
        threatVector = SstiThreatVector.DYNAMIC_EVAL_ATTEMPT;
      }
    } else {
      if (riskSeverity === TemplateRiskSeverity.SAFE_STATIC) {
        riskSeverity = TemplateRiskSeverity.SAFE_INTERPOLATED;
      }

      if (allowedVariables && allowedVariables.length > 0) {
        if (allowedVariables.includes(rawExpression)) {
          if (!allowedVariablesUsed.includes(rawExpression)) {
            allowedVariablesUsed.push(rawExpression);
          }
        } else {
          forbiddenVariablesBlocked.push(rawExpression);
          detectedThreats.push(`Variável fora da allowlist clínica estrita: {{${rawExpression}}}`);
          if (riskSeverity !== TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT) {
            riskSeverity = TemplateRiskSeverity.SUSPICIOUS_EXPRESSION;
            threatVector = SstiThreatVector.FORBIDDEN_IDENTIFIER;
          }
        }
      } else {
        if (!allowedVariablesUsed.includes(rawExpression)) {
          allowedVariablesUsed.push(rawExpression);
        }
      }
    }
  }

  // Sanitização: remove ou neutraliza tags perigosas
  let sanitizedTemplate = templateContent;
  if (detectedThreats.length > 0) {
    for (const forbidden of FORBIDDEN_SSTI_PATTERNS) {
      sanitizedTemplate = sanitizedTemplate.replace(forbidden.pattern, '[SSTI_PROTECTED_BLOCK]');
    }
    // Neutraliza expressões anômalas em {{...}}
    sanitizedTemplate = sanitizedTemplate.replace(/\{\{\s*([^a-zA-Z0-9_\s.]+?)\s*\}\}/g, '[INVALID_DYNAMIC_EXPR]');
  }

  const isValid = riskSeverity !== TemplateRiskSeverity.CRITICAL_SSTI_ATTEMPT;

  return {
    isValid,
    riskSeverity,
    threatVector,
    detectedThreats,
    sanitizedTemplate,
    allowedVariablesUsed,
    forbiddenVariablesBlocked
  };
}

/**
 * Renderiza o template em sandbox hermético sem prototype chain e sem eval/exec
 */
export function renderSandboxedTemplate(params: {
  templateContent: string;
  contextVariables?: Record<string, string>;
  strictSandboxing?: boolean;
  escapeHtml?: boolean;
  maxTemplateLength?: number;
}): SandboxedRenderResult {
  const {
    templateContent,
    contextVariables = {},
    strictSandboxing = true,
    escapeHtml = false,
    maxTemplateLength = 50000
  } = params;
  const startTime = performance.now();

  // 0. Validação de tamanho
  if (templateContent.length > maxTemplateLength) {
    const elapsed = performance.now() - startTime;
    return {
      renderedOutput: '',
      executionTimeMs: Math.round(elapsed * 100) / 100,
      variablesInterpolated: 0,
      wasSanitized: true,
      actionTaken: SstiSanitizationAction.BLOCKED_VULNERABLE
    };
  }

  // 1. Inspeciona o template
  const inspection = inspectTemplate(templateContent);

  // 2. Se for tentativa crítica e strictSandboxing estiver ativado, bloqueia imediatamente
  if (!inspection.isValid && strictSandboxing) {
    const elapsed = performance.now() - startTime;
    return {
      renderedOutput: '[RENDERIZAÇÃO CANCELADA: TENTATIVA DE SSTI INTERCEPTADA PELO ENCLAVE]',
      executionTimeMs: Math.round(elapsed * 100) / 100,
      variablesInterpolated: 0,
      wasSanitized: true,
      actionTaken: SstiSanitizationAction.BLOCKED_VULNERABLE
    };
  }

  // 3. Cria contexto hermético com Object.create(null) para eliminar qualquer herança de prototype
  const safeContext = contextVariables || {};
  const hermeticScope = Object.create(null);
  for (const [key, val] of Object.entries(safeContext)) {
    // Sanitiza chaves e valores
    if (/^[a-zA-Z0-9_.]+$/.test(key)) {
      const strVal = String(val ?? '');
      hermeticScope[key] = escapeHtml ? escapeTemplateOutput(strVal) : strVal;
    }
  }
  Object.freeze(hermeticScope);

  let templateToRender = inspection.isValid ? templateContent : inspection.sanitizedTemplate;
  const wasSanitized = !inspection.isValid;
  let variablesInterpolated = 0;

  // 4. Interpolação segura puramente léxica: substitui {{variavel}} sem executar código
  const renderedOutput = templateToRender.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, varName) => {
    if (Object.prototype.hasOwnProperty.call(hermeticScope, varName)) {
      variablesInterpolated++;
      return hermeticScope[varName];
    }
    // Suporte a caminhos aninhados rasos (ex: paciente.nome)
    if (varName.includes('.')) {
      const parts = varName.split('.');
      if (parts.length === 2 && Object.prototype.hasOwnProperty.call(hermeticScope, parts[1])) {
        variablesInterpolated++;
        return hermeticScope[parts[1]];
      }
    }
    // Variável não encontrada: preserva aviso neutro seguro
    return `[NÃO INFORMADO: ${varName}]`;
  });

  const elapsed = performance.now() - startTime;

  return {
    renderedOutput,
    executionTimeMs: Math.round(elapsed * 100) / 100,
    variablesInterpolated,
    wasSanitized,
    actionTaken: wasSanitized
      ? SstiSanitizationAction.SANITIZED_STRIPPED
      : SstiSanitizationAction.ALLOWED_SANDBOXED
  };
}

/**
 * Serialização canônica determinística conforme RFC 8785
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
 * Cria o Selo Probatório WORM HMAC-SHA256 para auditoria de integridade do template e renderização
 */
export function createSstiProofSeal(params: {
  template: string;
  context: Record<string, string>;
  output: string;
  inspection: TemplateInspectionResult;
  renderResult: SandboxedRenderResult;
  secret?: string;
}): SstiProofSeal {
  const { template, context, output, inspection, renderResult, secret = DEFAULT_HMAC_SECRET } = params;

  const templateHash = createHash('sha256').update(template.trim(), 'utf8').digest('hex');
  const contextHash = createHash('sha256').update(canonicalJsonStringify(context), 'utf8').digest('hex');
  const outputHash = createHash('sha256').update(output.trim(), 'utf8').digest('hex');

  const sealId = `ssti_seal_${randomBytes(12).toString('base64url')}`;
  const timestamp = new Date().toISOString();

  const sealPayload = {
    version: '1.0.0' as const,
    sealId,
    timestamp,
    templateHash,
    contextHash,
    outputHash,
    riskSeverity: inspection.riskSeverity,
    threatVector: inspection.threatVector,
    actionTaken: renderResult.actionTaken,
    executionTimeMs: renderResult.executionTimeMs
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
export function verifySstiProofSeal(seal: SstiProofSeal, secret: string = DEFAULT_HMAC_SECRET): boolean {
  if (!seal || seal.version !== '1.0.0' || !seal.hmacSignature) {
    return false;
  }

  const sealPayload = {
    version: seal.version,
    sealId: seal.sealId,
    timestamp: seal.timestamp,
    templateHash: seal.templateHash,
    contextHash: seal.contextHash,
    outputHash: seal.outputHash,
    riskSeverity: seal.riskSeverity,
    threatVector: seal.threatVector,
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
