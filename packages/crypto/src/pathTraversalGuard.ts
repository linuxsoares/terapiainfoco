/**
 * MÓDULO 69: SANITIZAÇÃO E VALIDAÇÃO ESTRITA DE CAMINHOS DE ARQUIVOS
 * & PREVENÇÃO ATIVA DE PATH TRAVERSAL / LOCAL FILE INCLUSION (LFI)
 *
 * Em conformidade estrita com:
 * - OWASP ASVS v4.0 V5.5 (File Path Sanitization & Traversal Prevention)
 * - CWE-22 (Improper Limitation of a Pathname to a Restricted Directory - Path Traversal)
 * - CWE-23 (Relative Path Traversal)
 * - CWE-73 (External Control of File Name or Path)
 * - Resoluções CFP nº 001/2009 e 004/2020 (Segurança e Sigilo de Prontuários e Anexos Clínicos)
 * - LGPD Art. 11 e Art. 16 (Proteção de Dados Sensíveis de Saúde)
 * - RFC 8785 (JSON Canonicalization Scheme - JCS)
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import {
  PathRiskSeverity,
  PathThreatVector,
  PathValidationAction,
  ClinicalAttachmentCategory,
} from '@terapiainfoco/shared';
import type {
  PathThreat,
  PathProofSeal,
  PathInspectionResult,
  SafePathResolutionResult,
  PathGuardPolicy,
  ClinicalAttachmentPreset,
} from '@terapiainfoco/shared';

/**
 * Chave secreta padrão para HMAC dos selos de segurança de caminhos
 */
const DEFAULT_PATH_GUARD_SECRET =
  process.env.PATH_TRAVERSAL_GUARD_SECRET || 'terapiainfoco_path_traversal_guard_master_secret_2026';

/**
 * Extensões de arquivos estritamente homologadas para prontuários clínicos
 */
export const DEFAULT_ALLOWED_CLINICAL_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tiff',
  '.txt',
  '.csv',
  '.json',
];

/**
 * Raízes seguras de isolamento (Jail / Chroot) por categoria clínica
 */
export const DEFAULT_SAFE_JAIL_ROOTS: Record<ClinicalAttachmentCategory, string> = {
  [ClinicalAttachmentCategory.ANAMNESIS_DOC]: '/var/terapiainfoco/storage/attachments/anamnesis',
  [ClinicalAttachmentCategory.NEUROPSYCH_REPORT]: '/var/terapiainfoco/storage/attachments/neuropsych',
  [ClinicalAttachmentCategory.MEDICAL_EXAM]: '/var/terapiainfoco/storage/attachments/medical_exams',
  [ClinicalAttachmentCategory.COURT_ORDER_CFP]: '/var/terapiainfoco/storage/attachments/court_orders',
  [ClinicalAttachmentCategory.CLINICAL_SUMMARY]: '/var/terapiainfoco/storage/attachments/summaries',
};

/**
 * Presets Clínicos Homologados para Anexos
 */
export const CLINICAL_ATTACHMENT_PRESETS: ClinicalAttachmentPreset[] = [
  {
    category: ClinicalAttachmentCategory.ANAMNESIS_DOC,
    label: 'Documentos e Fichas de Anamnese',
    description: 'Armazenamento isolado de prontuários, fichas prévias e anamneses familiares',
    jailDirectory: DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.ANAMNESIS_DOC],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.txt'],
    maxFileSizeMb: 15,
    sampleSafePath: `${DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.ANAMNESIS_DOC]}/paciente_102/anamnese_admissional.pdf`,
  },
  {
    category: ClinicalAttachmentCategory.NEUROPSYCH_REPORT,
    label: 'Laudos de Baterias Neuropsicológicas',
    description: 'Relatórios volumosos com gráficos de inventários psicológicos e escalas psicométricas',
    jailDirectory: DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.NEUROPSYCH_REPORT],
    allowedExtensions: ['.pdf', '.csv', '.json'],
    maxFileSizeMb: 30,
    sampleSafePath: `${DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.NEUROPSYCH_REPORT]}/laudo_wisc_iv_2026.pdf`,
  },
  {
    category: ClinicalAttachmentCategory.MEDICAL_EXAM,
    label: 'Exames Médicos e Neuroimagem Complementar',
    description: 'Ressonâncias magnéticas, eletroencefalogramas e encaminhamentos psiquiátricos',
    jailDirectory: DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.MEDICAL_EXAM],
    allowedExtensions: ['.pdf', '.jpg', '.png', '.tiff'],
    maxFileSizeMb: 50,
    sampleSafePath: `${DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.MEDICAL_EXAM]}/eeg_clinico_paciente_45.pdf`,
  },
  {
    category: ClinicalAttachmentCategory.COURT_ORDER_CFP,
    label: 'Ofícios e Determinações Judiciais CFP',
    description: 'Mandados de desarquivamento ético sob segredo de justiça (CFP nº 001/2009 Art. 9º)',
    jailDirectory: DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.COURT_ORDER_CFP],
    allowedExtensions: ['.pdf'],
    maxFileSizeMb: 20,
    sampleSafePath: `${DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.COURT_ORDER_CFP]}/vara_familia_mandado_789.pdf`,
  },
  {
    category: ClinicalAttachmentCategory.CLINICAL_SUMMARY,
    label: 'Resumos Clínicos de Encaminhamento',
    description: 'Sumários de evolução e relatórios de transferência entre profissionais de saúde',
    jailDirectory: DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.CLINICAL_SUMMARY],
    allowedExtensions: ['.pdf', '.txt'],
    maxFileSizeMb: 10,
    sampleSafePath: `${DEFAULT_SAFE_JAIL_ROOTS[ClinicalAttachmentCategory.CLINICAL_SUMMARY]}/sumario_clinico_transferencia.pdf`,
  },
];

/**
 * Política padrão de segurança de caminhos de arquivos
 */
export const DEFAULT_PATH_GUARD_POLICY: PathGuardPolicy = {
  strictJailEnforcement: true,
  disallowRelativeTraversal: true,
  disallowNullBytes: true,
  disallowUriWrappers: true,
  disallowDoubleEncoding: true,
  disallowAlternateDataStreams: true,
  allowedExtensions: DEFAULT_ALLOWED_CLINICAL_EXTENSIONS,
  maxFileNameLength: 255,
  maxPathLength: 1024,
  safeJailRoots: { ...DEFAULT_SAFE_JAIL_ROOTS },
  updatedAt: new Date().toISOString(),
};

/**
 * Esquemas de URI maliciosos e wrappers que causam LFI ou SSRF
 */
const FORBIDDEN_URI_SCHEMES = [
  'file://',
  'data://',
  'php://',
  'gopher://',
  'expect://',
  'zip://',
  'glob://',
  'phar://',
  'rar://',
  'ogg://',
  'http://',
  'https://',
  'ftp://',
];

/**
 * Diretórios de sistema sensíveis no Linux/Unix e Windows
 */
const FORBIDDEN_SYSTEM_PATHS = [
  '/etc/',
  '/proc/',
  '/sys/',
  '/dev/',
  '/root/',
  '/var/log/',
  '/var/run/',
  '/boot/',
  '/bin/',
  '/sbin/',
  '/usr/bin/',
  '/usr/sbin/',
  'c:\\windows',
  'c:\\system32',
  'c:\\boot',
  'c:\\program files',
  '\\\\', // UNC paths
];

/**
 * Extensões de alto risco (executáveis, scripts, binários)
 */
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.vbs',
  '.js',
  '.ts',
  '.mjs',
  '.php',
  '.phtml',
  '.py',
  '.rb',
  '.pl',
  '.cgi',
  '.jsp',
  '.asp',
  '.aspx',
  '.jar',
  '.so',
  '.dll',
  '.dylib',
  '.elf',
];

/**
 * Canonicalização determinística RFC 8785 (JCS)
 */
export function canonicalJsonStringify(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return `[${data.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const obj = data as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Decodificação recursiva contra evasão por multi-layer percent-encoding
 */
export function recursiveUrlDecode(input: string, maxDepth = 5): { decoded: string; wasMultiEncoded: boolean } {
  let current = input;
  let iterations = 0;
  let wasMultiEncoded = false;

  while (iterations < maxDepth) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      current = decoded;
      iterations++;
      if (iterations > 1) {
        wasMultiEncoded = true;
      }
    } catch {
      // Se não for percent-encoding válido, para
      break;
    }
  }

  return { decoded: current, wasMultiEncoded };
}

/**
 * Normaliza e padroniza separadores de caminho
 */
export function normalizeSeparators(pathStr: string): string {
  // Converte backslashes e sequências de Unicode lookalikes para slash padrão
  return pathStr
    .replace(/[\\\/]+/g, '/')
    .replace(/\u2215|\u2216|\uff0f/g, '/');
}

/**
 * Resolve componentes de caminho léxicos (ex: /a/b/../c -> /a/c) sem acessar disco
 */
export function resolveLexicalPath(basePath: string, relativeOrAbsolutePath: string): string {
  const normBase = normalizeSeparators(basePath).replace(/\/$/, '');
  const normTarget = normalizeSeparators(relativeOrAbsolutePath);

  // Se o caminho fornecido for absoluto, começa do target ou une com a base se for relativo
  const fullPath = normTarget.startsWith('/') ? normTarget : `${normBase}/${normTarget}`;

  const segments = fullPath.split('/');
  const resolvedStack: string[] = [];

  for (const seg of segments) {
    if (!seg || seg === '.') {
      continue;
    }
    if (seg === '..') {
      if (resolvedStack.length > 0) {
        resolvedStack.pop();
      }
    } else {
      resolvedStack.push(seg);
    }
  }

  const result = '/' + resolvedStack.join('/');
  return result;
}

/**
 * Sanitiza o nome de um arquivo clínico preservando integridade da extensão permitida
 */
export function sanitizeSafeFileName(fileName: string, allowedExtensions = DEFAULT_ALLOWED_CLINICAL_EXTENSIONS): string {
  // Remove bytes nulos e caminhos
  let baseName = normalizeSeparators(fileName).split('/').pop() || 'document';
  baseName = baseName.replace(/\0/g, '').trim();

  // Extrai extensão
  const dotIndex = baseName.lastIndexOf('.');
  let ext = '';
  let rawName = baseName;

  if (dotIndex !== -1) {
    ext = baseName.substring(dotIndex).toLowerCase();
    rawName = baseName.substring(0, dotIndex);
  }

  // Se a extensão for perigosa ou não autorizada, substitui por .pdf seguro
  if (!allowedExtensions.includes(ext) || DANGEROUS_EXTENSIONS.includes(ext)) {
    ext = '.pdf';
  }

  // Remove diacríticos/acentos e caracteres proibidos no sistema operacional e espaços
  const normalizedAccents = rawName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const safeName = normalizedAccents
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 100);

  const fallbackName = safeName.length > 0 ? safeName : 'anexo_clinico';
  const timestamp = Date.now();
  const randomSuffix = randomBytes(4).toString('hex');

  return `${fallbackName}_${timestamp}_${randomSuffix}${ext}`;
}

/**
 * Cria o Selo Notarial Probatório WORM RFC 8785
 */
export function createPathTraversalProofSeal(
  canonicalPath: string,
  action: PathValidationAction,
  safeJailRoot: string,
  secret = DEFAULT_PATH_GUARD_SECRET
): PathProofSeal {
  const timestamp = new Date().toISOString();
  const payloadToSign = {
    canonicalPath,
    action,
    safeJailRoot,
    timestamp,
  };

  const canonicalString = canonicalJsonStringify(payloadToSign);
  const hmac = createHmac('sha256', secret);
  hmac.update(canonicalString);
  const signature = hmac.digest('hex');

  const sha256Digest = createHmac('sha256', 'digest_salt_2026')
    .update(canonicalString)
    .digest('hex');

  const sealId = `path_guard_seal_v1_${Buffer.from(signature).toString('base64url').substring(0, 24)}`;

  return {
    sealId,
    timestamp,
    canonicalPath,
    sha256Digest,
    signature,
    action,
    safeJailRoot,
  };
}

/**
 * Valida a autenticidade do Selo Probatório WORM
 */
export function verifyPathTraversalProofSeal(
  seal: PathProofSeal,
  secret = DEFAULT_PATH_GUARD_SECRET
): { isValid: boolean; message: string } {
  try {
    const payloadToSign = {
      canonicalPath: seal.canonicalPath,
      action: seal.action,
      safeJailRoot: seal.safeJailRoot,
      timestamp: seal.timestamp,
    };

    const canonicalString = canonicalJsonStringify(payloadToSign);
    const hmac = createHmac('sha256', secret);
    hmac.update(canonicalString);
    const expectedSignature = hmac.digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const actualBuf = Buffer.from(seal.signature, 'hex');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return { isValid: false, message: 'Assinatura criptográfica HMAC do selo de caminho é inválida ou foi forjada' };
    }

    return { isValid: true, message: 'Selo notarial probatório WORM verificado com 100% de integridade criptográfica' };
  } catch (err) {
    return { isValid: false, message: `Erro ao validar selo: ${(err as Error).message}` };
  }
}

/**
 * Inspeciona léxica e heuristicamente um caminho de arquivo fornecido
 */
export function inspectPath(
  rawPath: string,
  safeJailRoot: string,
  policy: PathGuardPolicy = DEFAULT_PATH_GUARD_POLICY
): PathInspectionResult {
  const startUs = process.hrtime.bigint();
  const threats: PathThreat[] = [];

  // 1. Verificação de tamanho máximo
  if (rawPath.length > policy.maxPathLength) {
    threats.push({
      vector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: `Comprimento do caminho excede o limite permitido (${rawPath.length} > ${policy.maxPathLength})`,
      matchedSegment: rawPath.substring(0, 50) + '...',
    });
  }

  // 2. Detecção de Bytes Nulos (%00, \0, \u0000)
  if (rawPath.includes('\0') || /%00|\u0000/i.test(rawPath)) {
    threats.push({
      vector: PathThreatVector.NULL_BYTE_TERMINATION,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: 'Tentativa de injeção de byte nulo (Null Byte Poisoning) detectada',
      matchedSegment: '%00',
    });
  }

  // 3. Detecção de Multi-layer Percent Encoding
  const { decoded, wasMultiEncoded } = recursiveUrlDecode(rawPath);
  if (wasMultiEncoded) {
    threats.push({
      vector: PathThreatVector.DOUBLE_PERCENT_ENCODING,
      severity: PathRiskSeverity.POTENTIAL_TRAVERSAL,
      description: 'Caminho continha codificação percentual múltipla/dupla para evasão de inspeção',
      matchedSegment: rawPath,
    });
  }

  // 4. Detecção de Esquemas URI Maliciosos / Wrappers LFI
  const lowerDecoded = decoded.toLowerCase();
  for (const scheme of FORBIDDEN_URI_SCHEMES) {
    if (lowerDecoded.startsWith(scheme) || lowerDecoded.includes(`://${scheme}`) || lowerDecoded.includes(scheme)) {
      threats.push({
        vector: PathThreatVector.URI_SCHEME_WRAPPER,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        description: `Esquema de URI ou wrapper não autorizado detectado: ${scheme}`,
        matchedSegment: scheme,
      });
      break;
    }
  }

  // 5. Detecção de Alternate Data Streams no Windows (::$DATA)
  if (/::\$DATA/i.test(decoded)) {
    threats.push({
      vector: PathThreatVector.WINDOWS_ALTERNATE_STREAM,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: 'Tentativa de injeção de Alternate Data Stream (::$DATA) NTFS detectada',
      matchedSegment: '::$DATA',
    });
  }

  // 6. Detecção de Acesso a Caminhos Absolutos de Sistema
  const normalizedSeparators = normalizeSeparators(decoded);
  for (const sysPath of FORBIDDEN_SYSTEM_PATHS) {
    if (normalizedSeparators.toLowerCase().startsWith(sysPath) || normalizedSeparators.toLowerCase().includes(sysPath)) {
      threats.push({
        vector: PathThreatVector.ABSOLUTE_SYSTEM_ROOT,
        severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
        description: `Tentativa de acesso a diretório sensível do sistema operacional: ${sysPath}`,
        matchedSegment: sysPath,
      });
      break;
    }
  }

  // 7. Detecção de Sequências Relativas de Escape (../, ..\, ..;, ....//)
  if (
    /\.\.[\/\\]/.test(rawPath) ||
    /\.\.[\/\\]/.test(decoded) ||
    /%2e%2e[\/\\]/i.test(rawPath) ||
    /\.\.\;\//.test(decoded) ||
    /\.\.\.\.[\/\\]{2,}/.test(decoded)
  ) {
    threats.push({
      vector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: 'Sequência de evasão relativa de diretório (Directory Traversal - ../) detectada',
      matchedSegment: '..',
    });
  }

  // 8. Resolução Canônica Segura e Confinamento na Jail
  const resolvedAbsolutePath = resolveLexicalPath(safeJailRoot, normalizedSeparators);
  const normJailRoot = normalizeSeparators(safeJailRoot).replace(/\/$/, '');
  const isWithinJail = resolvedAbsolutePath.startsWith(normJailRoot + '/') || resolvedAbsolutePath === normJailRoot;

  if (!isWithinJail) {
    threats.push({
      vector: PathThreatVector.RELATIVE_DOT_DOT_TRAVERSAL,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: `Caminho final resolvido (${resolvedAbsolutePath}) extravasa os limites do Jail Chroot (${normJailRoot})`,
      matchedSegment: resolvedAbsolutePath,
    });
  }

  // 9. Validação de Extensão
  const fileName = resolvedAbsolutePath.split('/').pop() || '';
  const dotIdx = fileName.lastIndexOf('.');
  const fileExt = dotIdx !== -1 ? fileName.substring(dotIdx).toLowerCase() : '';

  const isDangerousExt = DANGEROUS_EXTENSIONS.includes(fileExt);
  const isAllowedExt = policy.allowedExtensions.includes(fileExt);

  if (isDangerousExt) {
    threats.push({
      vector: PathThreatVector.DANGEROUS_FILE_EXTENSION,
      severity: PathRiskSeverity.CRITICAL_PATH_TRAVERSAL,
      description: `Tentativa de upload ou referência a extensão executável/perigosa: ${fileExt}`,
      matchedSegment: fileExt,
    });
  } else if (!isAllowedExt && fileExt !== '') {
    threats.push({
      vector: PathThreatVector.DANGEROUS_FILE_EXTENSION,
      severity: PathRiskSeverity.POTENTIAL_TRAVERSAL,
      description: `Extensão '${fileExt}' não consta na allowlist de anexos clínicos`,
      matchedSegment: fileExt,
    });
  }

  // Determinar severidade e ação recomendada
  let severity = PathRiskSeverity.SAFE_CANONICAL;
  let recommendedAction = PathValidationAction.CANONICALLY_RESOLVED;

  const hasCritical = threats.some((t) => t.severity === PathRiskSeverity.CRITICAL_PATH_TRAVERSAL);
  const hasPotential = threats.some((t) => t.severity === PathRiskSeverity.POTENTIAL_TRAVERSAL);

  if (hasCritical) {
    severity = PathRiskSeverity.CRITICAL_PATH_TRAVERSAL;
    recommendedAction = PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT;
  } else if (hasPotential) {
    severity = PathRiskSeverity.POTENTIAL_TRAVERSAL;
    recommendedAction = PathValidationAction.SANITIZED_AND_JAIL_BOUND;
  } else if (rawPath !== normalizedSeparators || rawPath !== decoded) {
    severity = PathRiskSeverity.SUSPICIOUS_NORMALIZATION;
    recommendedAction = PathValidationAction.CANONICALLY_RESOLVED;
  }

  const sanitizedFileName = sanitizeSafeFileName(fileName, policy.allowedExtensions);
  const endUs = process.hrtime.bigint();
  const latencyUs = Number(endUs - startUs) / 1000;

  return {
    rawPath,
    normalizedPath: normalizedSeparators,
    resolvedAbsolutePath,
    safeJailRoot: normJailRoot,
    isWithinJail,
    severity,
    threats,
    sanitizedFileName,
    allowedExtension: isAllowedExt && !isDangerousExt,
    fileExtension: fileExt,
    inspectionLatencyUs: Math.round(latencyUs * 100) / 100,
    recommendedAction,
  };
}

/**
 * Resolve e confina seguramente um anexo clínico em seu Jail Chroot homologado
 */
export function resolveSafeAttachmentPath(
  category: ClinicalAttachmentCategory,
  proposedPath: string,
  policy: PathGuardPolicy = DEFAULT_PATH_GUARD_POLICY
): SafePathResolutionResult {
  const jailRoot = policy.safeJailRoots[category] || DEFAULT_SAFE_JAIL_ROOTS[category];
  const inspection = inspectPath(proposedPath, jailRoot, policy);

  // Se for crítico e strictJailEnforcement estiver ligado, bloqueia
  if (inspection.severity === PathRiskSeverity.CRITICAL_PATH_TRAVERSAL && policy.strictJailEnforcement) {
    const proofSeal = createPathTraversalProofSeal(
      inspection.resolvedAbsolutePath,
      PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT,
      jailRoot
    );

    return {
      success: false,
      originalPath: proposedPath,
      canonicalStoragePath: `${jailRoot}/quarantine/${inspection.sanitizedFileName}`,
      safeJailRoot: jailRoot,
      safeFileName: inspection.sanitizedFileName,
      fileExtension: inspection.fileExtension,
      category,
      actionTaken: PathValidationAction.BLOCKED_TRAVERSAL_ATTEMPT,
      proofSeal,
      quarantined: true,
      errorReason: inspection.threats.map((t) => t.description).join('; '),
    };
  }

  // Confinamento canônico
  const safeFileName = inspection.sanitizedFileName;
  const canonicalStoragePath = `${jailRoot}/${safeFileName}`;
  const actionTaken =
    inspection.threats.length > 0
      ? PathValidationAction.SANITIZED_AND_JAIL_BOUND
      : PathValidationAction.CANONICALLY_RESOLVED;

  const proofSeal = createPathTraversalProofSeal(canonicalStoragePath, actionTaken, jailRoot);

  return {
    success: true,
    originalPath: proposedPath,
    canonicalStoragePath,
    safeJailRoot: jailRoot,
    safeFileName,
    fileExtension: inspection.fileExtension,
    category,
    actionTaken,
    proofSeal,
    quarantined: false,
  };
}
