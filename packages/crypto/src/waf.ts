/**
 * Motor de Web Application Firewall (WAF) em Camada de Aplicação
 * RFC-001 §4.4, §5.2 e OWASP Top 10 (SQL Injection, XSS, Path Traversal, RCE)
 */

import { WafAttackType, type WafInspectionResult, type WafMatchedRule } from '@terapiainfoco/shared';

export interface WafRuleDefinition {
  ruleId: string;
  category: WafAttackType;
  description: string;
  severityScore: number;
  regex: RegExp;
}

/**
 * Catálogo Oficial de Regras Heurísticas do WAF TerapiaInFoco
 */
export const WAF_RULES_CATALOG: WafRuleDefinition[] = [
  // 1. SQL Injection (SQLi)
  {
    ruleId: 'WAF-SQLI-001',
    category: WafAttackType.SQL_INJECTION,
    description: 'Union-based SQL Injection detectada',
    severityScore: 95,
    regex: /\bunion\b\s+(all\s+)?\bselect\b/i
  },
  {
    ruleId: 'WAF-SQLI-002',
    category: WafAttackType.SQL_INJECTION,
    description: 'Tautologia booleana em SQL Injection (ex: OR 1=1)',
    severityScore: 90,
    regex: /('|"|`)\s*(or|and)\s*('|"|`)?([0-9]+|[a-z]+)('|"|`)?\s*(=|!=|<>|<|>)\s*('|"|`)?([0-9]+|[a-z]+)/i
  },
  {
    ruleId: 'WAF-SQLI-003',
    category: WafAttackType.SQL_INJECTION,
    description: 'Instruções destrutivas de DDL/DML em SQL (DROP/TRUNCATE/ALTER)',
    severityScore: 95,
    regex: /\b(drop|truncate|alter)\b\s+\b(table|database|schema)\b/i
  },
  {
    ruleId: 'WAF-SQLI-004',
    category: WafAttackType.SQL_INJECTION,
    description: 'Execução de Stored Procedures do sistema ou encadeamento de comandos SQL',
    severityScore: 90,
    regex: /;\s*(shutdown|exec|execute|xp_cmdshell|sp_executesql)\b/i
  },
  {
    ruleId: 'WAF-SQLI-005',
    category: WafAttackType.SQL_INJECTION,
    description: 'Time-based Blind SQL Injection (WAITFOR DELAY / SLEEP / BENCHMARK)',
    severityScore: 90,
    regex: /\b(waitfor\s+delay|sleep\s*\(|benchmark\s*\()/i
  },
  {
    ruleId: 'WAF-SQLI-006',
    category: WafAttackType.SQL_INJECTION,
    description: 'Comentários inline ou delimitadores SQL suspeitos',
    severityScore: 40,
    regex: /(--|\/\*|#)\s*[\w\d]/i
  },

  // 2. Cross-Site Scripting (XSS)
  {
    ruleId: 'WAF-XSS-001',
    category: WafAttackType.CROSS_SITE_SCRIPTING,
    description: 'Tag HTML <script> explícita ou variante com atributos',
    severityScore: 95,
    regex: /<\s*script\b[^>]*>/i
  },
  {
    ruleId: 'WAF-XSS-002',
    category: WafAttackType.CROSS_SITE_SCRIPTING,
    description: 'Pseudo-protocolo javascript: em URI ou atributos',
    severityScore: 90,
    regex: /javascript\s*:\s*[a-z0-9_]/i
  },
  {
    ruleId: 'WAF-XSS-003',
    category: WafAttackType.CROSS_SITE_SCRIPTING,
    description: 'Manipuladores de eventos inline maliciosos (onload, onerror, onclick)',
    severityScore: 85,
    regex: /\bon(error|load|click|mouseover|focus|blur|change|submit)\s*=/i
  },
  {
    ruleId: 'WAF-XSS-004',
    category: WafAttackType.CROSS_SITE_SCRIPTING,
    description: 'Tags de mídia/frame perigosas com payloads injetados (iframe/object/embed/svg)',
    severityScore: 90,
    regex: /<\s*(iframe|object|embed|svg|img)\b[^>]*\b(onload|onerror|src\s*=\s*['"]?javascript)/i
  },
  {
    ruleId: 'WAF-XSS-005',
    category: WafAttackType.CROSS_SITE_SCRIPTING,
    description: 'Acesso a propriedades sensíveis do DOM (document.cookie/location/write)',
    severityScore: 80,
    regex: /\bdocument\s*\.\s*(cookie|location|write|domain)\b/i
  },

  // 3. Path Traversal & Local File Inclusion (LFI)
  {
    ruleId: 'WAF-LFI-001',
    category: WafAttackType.PATH_TRAVERSAL,
    description: 'Sequência de escape de diretório (Directory Traversal ../ ou ..\\)',
    severityScore: 85,
    regex: /(\.\.[/\\]|[/\\]\.\.)/
  },
  {
    ruleId: 'WAF-LFI-002',
    category: WafAttackType.PATH_TRAVERSAL,
    description: 'Acesso a arquivos críticos do sistema operacional (/etc/passwd, system32)',
    severityScore: 95,
    regex: /(etc[/\\]passwd|windows[/\\]system32|boot\.ini)/i
  },

  // 4. Remote Command Execution / Shell Injection
  {
    ruleId: 'WAF-CMD-001',
    category: WafAttackType.COMMAND_INJECTION,
    description: 'Encadeamento de comandos shell com binários de sistema (cat, whoami, etc.)',
    severityScore: 95,
    regex: /(\|\||&&|;|\`)\s*(cat|ls|whoami|id|bash|sh|curl|wget|nc|powershell|cmd)\b/i
  },
  {
    ruleId: 'WAF-CMD-002',
    category: WafAttackType.COMMAND_INJECTION,
    description: 'Subshell ou interpolação de comandos $(...)',
    severityScore: 85,
    regex: /\$\([a-z0-9_ -]+\)/i
  }
];

/**
 * Normaliza e sanitiza a string para neutralizar tentativas de evasão (double encoding, null bytes)
 */
function normalizeForInspection(raw: string): string {
  if (!raw) return '';
  let str = raw.replace(/\0/g, ''); // remove null bytes

  // Decodifica URL encoding iterativamente até 3 vezes
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(str);
      if (decoded === str) break;
      str = decoded;
    } catch {
      break;
    }
  }

  // Decodifica entidades HTML básicas
  str = str
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');

  return str;
}

/**
 * Inspeciona recursivamente uma estrutura de dados arbitrária (JSON, string, array)
 */
export function inspectPayload(
  input: any,
  options: {
    maxDepth?: number;
    blockThreshold?: number;
    pathPrefix?: string;
  } = {}
): WafInspectionResult {
  const maxDepth = options.maxDepth ?? 5;
  const blockThreshold = options.blockThreshold ?? 70;
  const matchedRules: WafMatchedRule[] = [];
  const now = new Date().toISOString();

  function scanValue(val: any, depth: number, currentPath: string) {
    if (depth > maxDepth) return;
    if (val === null || val === undefined) return;

    if (typeof val === 'string') {
      const normalized = normalizeForInspection(val);
      for (const rule of WAF_RULES_CATALOG) {
        if (rule.regex.test(normalized)) {
          const match = normalized.match(rule.regex);
          matchedRules.push({
            ruleId: rule.ruleId,
            category: rule.category,
            description: rule.description,
            severityScore: rule.severityScore,
            detectedPattern: match ? match[0].slice(0, 100) : rule.ruleId,
            fieldPath: currentPath || 'root'
          });
        }
      }
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        scanValue(val[i], depth + 1, `${currentPath}[${i}]`);
      }
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        // Inspeciona também a chave do objeto para prevenir Prototype Pollution / Key Injection
        scanValue(k, depth + 1, `${currentPath}.${k}[key]`);
        scanValue(v, depth + 1, currentPath ? `${currentPath}.${k}` : k);
      }
    }
  }

  scanValue(input, 0, options.pathPrefix || '');

  // Deduplicação de regras no mesmo campo
  const uniqueKey = (r: WafMatchedRule) => `${r.ruleId}:${r.fieldPath}`;
  const seen = new Set<string>();
  const dedupedRules: WafMatchedRule[] = [];
  for (const r of matchedRules) {
    const k = uniqueKey(r);
    if (!seen.has(k)) {
      seen.add(k);
      dedupedRules.push(r);
    }
  }

  // Cálculo de threatScore (0 a 100)
  let threatScore = 0;
  if (dedupedRules.length > 0) {
    const maxSeverity = Math.max(...dedupedRules.map(r => r.severityScore));
    // Bônus proporcional a múltiplas violações detectadas
    const bonus = Math.min(25, (dedupedRules.length - 1) * 10);
    threatScore = Math.min(100, maxSeverity + bonus);
  }

  const passed = threatScore < blockThreshold;
  const actionTaken = passed ? 'PASSED' : 'BLOCKED';

  return {
    passed,
    threatScore,
    matchedRules: dedupedRules,
    inspectedAt: now,
    actionTaken
  };
}
