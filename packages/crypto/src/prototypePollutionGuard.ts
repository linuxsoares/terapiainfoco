import crypto from 'node:crypto';
import {
  PollutionThreatSeverity,
  PollutionAttackVector,
  SanitizationStrategy,
  PayloadCategory
} from '@terapiainfoco/shared';
import type {
  PollutionThreat,
  PollutionProofSeal,
  PollutionScanResult,
  PollutionGuardPolicy
} from '@terapiainfoco/shared';

// Chave mestra para selagem forense WORM de sanitização de protótipo (RFC 8785)
const PROTO_SEAL_KEY = process.env.PROTOTYPE_GUARD_SEAL_SECRET || 'terapiainfoco_prototype_pollution_guard_worm_seal_key_2026';

// Conjunto de identificadores proibidos associados à cadeia de protótipos e meta-programação do V8/JavaScript (em minúsculas)
export const DANGEROUS_PROTO_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__definegetter__',
  '__definesetter__',
  '__lookupgetter__',
  '__lookupsetter__'
]);

// Padrões de desserialização perigosa e injeção de código em strings
const SUSPICIOUS_DESERIALIZATION_PATTERNS = [
  /_\\\$\\\$ND_FUNC\\\$\\$_/i, // Padrão clássico node-serialize RCE
  /Function\s*\(/i,
  /eval\s*\(/i,
  /child_process/i,
  /process\.mainModule/i,
  /require\s*\(/i
];

/**
 * Serialização determinística canônica JSON conforme RFC 8785 (JCS)
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Converte Buffer ou String para Base64URL (RFC 7515)
 */
export function toBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Converte Base64URL para Buffer
 */
export function fromBase64Url(base64url: string): Buffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Cria um dicionário totalmente limpo derivado de protótipo nulo (Object.create(null)).
 * Imune nativamente a acessos acidentais a propriedades de Object.prototype.
 */
export function createCleanDictionary<T = any>(): Record<string, T> {
  return Object.create(null);
}

/**
 * Verifica se uma chave individual é considerada de alto risco para poluição de protótipo.
 */
export function isDangerousKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  const normalized = key.trim().toLowerCase();
  return DANGEROUS_PROTO_KEYS.has(normalized);
}

/**
 * Congela recursivamente um objeto para garantir imutabilidade estrita.
 */
export function safeFreezeRecursively<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val !== null && (typeof val === 'object' || typeof val === 'function') && !Object.isFrozen(val)) {
      safeFreezeRecursively(val);
    }
  }
  return obj;
}

export interface SanitizeOptions {
  strategy?: SanitizationStrategy;
  maxDepth?: number;
  maxKeyCount?: number;
  freeze?: boolean;
  stripGettersSetters?: boolean;
  allowlist?: string[];
}

/**
 * Opções padrão da política
 */
export const DEFAULT_POLICE: PollutionGuardPolicy = {
  defaultStrategy: SanitizationStrategy.NULL_PROTOTYPE_FREEZE,
  maxAllowedDepth: 10,
  maxKeyCount: 1000,
  blockOnCriticalThreat: true,
  freezeSanitizedObjects: true,
  stripGettersSetters: true,
  allowedKeysAllowlist: [
    'patientId', 'therapistId', 'crp', 'name', 'email', 'notes', 'cid11',
    'symptoms', 'plan', 'assessment', 'metadata', 'tags', 'timestamp', 'status'
  ]
};

/**
 * Emite um Selo Probatório WORM de Varredura e Sanitização (RFC 8785 & HMAC-SHA256)
 */
export function createPollutionProofSeal(params: {
  scanId: string;
  category: PayloadCategory;
  threatsCount: number;
  isClean: boolean;
  timestamp: string;
}): PollutionProofSeal {
  const canonicalData = canonicalStringify({
    version: '1.0.0',
    scanId: params.scanId,
    category: params.category,
    threatsCount: params.threatsCount,
    isClean: params.isClean,
    timestamp: params.timestamp
  });

  const canonicalHash = crypto.createHash('sha256').update(canonicalData, 'utf-8').digest('hex');
  const hmacSignature = crypto
    .createHmac('sha256', PROTO_SEAL_KEY)
    .update(canonicalHash, 'hex')
    .digest('hex');

  const tokenPayload = JSON.stringify({
    version: '1.0.0',
    scanId: params.scanId,
    category: params.category,
    threatsCount: params.threatsCount,
    isClean: params.isClean,
    timestamp: params.timestamp,
    canonicalHash,
    hmacSignature
  });

  const signature = `proto_guard_v1_${toBase64Url(tokenPayload)}`;

  return {
    version: '1.0.0',
    scanId: params.scanId,
    category: params.category,
    threatsCount: params.threatsCount,
    isClean: params.isClean,
    timestamp: params.timestamp,
    canonicalHash,
    signature
  };
}

/**
 * Valida a autenticidade e integridade de um Selo Probatório WORM de Prototype Pollution
 */
export function verifyPollutionSeal(sealToken: string): {
  isValid: boolean;
  seal?: PollutionProofSeal;
  message: string;
} {
  try {
    if (!sealToken || !sealToken.startsWith('proto_guard_v1_')) {
      return { isValid: false, message: 'Token de selo inválido ou com prefixo ausente' };
    }

    const rawPayload = fromBase64Url(sealToken.replace('proto_guard_v1_', '')).toString('utf-8');
    const parsed = JSON.parse(rawPayload);

    if (!parsed.scanId || !parsed.canonicalHash || !parsed.hmacSignature) {
      return { isValid: false, message: 'Estrutura interna do selo malformada' };
    }

    // Recomputar hash canônico JCS
    const recomputedCanonical = canonicalStringify({
      version: parsed.version || '1.0.0',
      scanId: parsed.scanId,
      category: parsed.category,
      threatsCount: parsed.threatsCount,
      isClean: parsed.isClean,
      timestamp: parsed.timestamp
    });

    const expectedHash = crypto.createHash('sha256').update(recomputedCanonical, 'utf-8').digest('hex');
    if (expectedHash !== parsed.canonicalHash) {
      return { isValid: false, message: 'Adulteração detectada no payload canônico (Hash Mismatch)' };
    }

    // Validar assinatura HMAC
    const expectedHmac = crypto
      .createHmac('sha256', PROTO_SEAL_KEY)
      .update(expectedHash, 'hex')
      .digest('hex');

    const hmacMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHmac, 'hex'),
      Buffer.from(parsed.hmacSignature, 'hex')
    );

    if (!hmacMatch) {
      return { isValid: false, message: 'Assinatura HMAC-SHA256 forjada ou chave inválida' };
    }

    const seal: PollutionProofSeal = {
      version: parsed.version,
      scanId: parsed.scanId,
      category: parsed.category,
      threatsCount: parsed.threatsCount,
      isClean: parsed.isClean,
      timestamp: parsed.timestamp,
      canonicalHash: parsed.canonicalHash,
      signature: sealToken
    };

    return { isValid: true, seal, message: 'Selo probatório WORM autêntico e íntegro (RFC 8785)' };
  } catch (err: any) {
    return { isValid: false, message: `Erro ao validar selo: ${err.message}` };
  }
}

/**
 * Realiza varredura profunda e sanitização completa de um payload arbitrário.
 * Detecta vetores de poluição de protótipo, referências circulares e desserialização insegura.
 */
export function scanAndSanitizePayload(
  payload: any,
  category: PayloadCategory = PayloadCategory.CLINICAL_ANAMNESIS,
  options: SanitizeOptions = {}
): PollutionScanResult {
  const startTime = process.hrtime.bigint();
  const scanId = `scan_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const timestamp = new Date().toISOString();

  const maxDepth = options.maxDepth ?? DEFAULT_POLICE.maxAllowedDepth;
  const maxKeys = options.maxKeyCount ?? DEFAULT_POLICE.maxKeyCount;
  const strategy = options.strategy ?? DEFAULT_POLICE.defaultStrategy;
  const shouldFreeze = options.freeze ?? DEFAULT_POLICE.freezeSanitizedObjects;

  const threatsDetected: PollutionThreat[] = [];
  const visitedObjects = new WeakSet<object>();

  let totalKeysEvaluated = 0;
  let maxDepthReached = 0;

  // Função recursiva de inspeção e sanitização
  function inspectAndClone(node: any, currentPath: string, currentDepth: number): any {
    if (currentDepth > maxDepthReached) {
      maxDepthReached = currentDepth;
    }

    if (currentDepth > maxDepth) {
      threatsDetected.push({
        vector: PollutionAttackVector.NESTED_DEPTH_OVERFLOW,
        path: currentPath || 'root',
        maliciousKey: 'depth_limit_exceeded',
        sampleValue: `depth=${currentDepth} > max=${maxDepth}`,
        severity: PollutionThreatSeverity.MEDIUM,
        description: `Profundidade de aninhamento (${currentDepth}) ultrapassou o limite seguro de ${maxDepth} níveis.`
      });
      return null;
    }

    // Primitivos e tipos diretos
    if (node === null || node === undefined) {
      return node;
    }

    if (typeof node === 'string') {
      // Checar padrões de desserialização insegura
      for (const pattern of SUSPICIOUS_DESERIALIZATION_PATTERNS) {
        if (pattern.test(node)) {
          threatsDetected.push({
            vector: PollutionAttackVector.INSECURE_DESERIALIZATION,
            path: currentPath,
            maliciousKey: 'serialized_payload',
            sampleValue: node.slice(0, 60),
            severity: PollutionThreatSeverity.CRITICAL,
            description: 'Padrão suspeito de desserialização de código remoto / RCE detectado na string.'
          });
        }
      }
      return node;
    }

    if (typeof node === 'number' || typeof node === 'boolean') {
      return node;
    }

    if (typeof node === 'function') {
      threatsDetected.push({
        vector: PollutionAttackVector.INSECURE_DESERIALIZATION,
        path: currentPath,
        maliciousKey: 'executable_function',
        sampleValue: node.name || 'anonymous',
        severity: PollutionThreatSeverity.CRITICAL,
        description: 'Função executável injetada em estrutura de dados clínicos.'
      });
      return null;
    }

    if (typeof node !== 'object') {
      return node;
    }

    // Detecção de Referências Circulares (DoS Bomb)
    if (visitedObjects.has(node)) {
      threatsDetected.push({
        vector: PollutionAttackVector.CIRCULAR_REFERENCE_BOMB,
        path: currentPath,
        maliciousKey: 'circular_ref',
        sampleValue: '[Circular Reference]',
        severity: PollutionThreatSeverity.HIGH,
        description: 'Referência circular detectada. Bloqueada para prevenir Stack Overflow por recursão infinita.'
      });
      return '[SANITIZED_CIRCULAR_REF]';
    }

    visitedObjects.add(node);

    // Arrays
    if (Array.isArray(node)) {
      const sanitizedArray: any[] = [];
      for (let i = 0; i < node.length; i++) {
        totalKeysEvaluated++;
        if (totalKeysEvaluated > maxKeys) {
          threatsDetected.push({
            vector: PollutionAttackVector.NESTED_DEPTH_OVERFLOW,
            path: `${currentPath}[${i}]`,
            maliciousKey: 'key_count_overflow',
            sampleValue: `keys=${totalKeysEvaluated} > max=${maxKeys}`,
            severity: PollutionThreatSeverity.HIGH,
            description: `Contagem total de propriedades excedeu o limite máximo (${maxKeys}).`
          });
          break;
        }
        sanitizedArray.push(inspectAndClone(node[i], `${currentPath}[${i}]`, currentDepth + 1));
      }
      return sanitizedArray;
    }

    // Objetos comuns: Iniciar objeto de destino seguro
    const sanitizedObj = strategy === SanitizationStrategy.NULL_PROTOTYPE_FREEZE
      ? Object.create(null)
      : {};

    // Inspecionar chaves próprias e símbolos
    const ownKeys = Object.getOwnPropertyNames(node);

    // Checar explicitamente se o objeto tenta expor getters/setters perigosos
    for (const key of ownKeys) {
      totalKeysEvaluated++;
      if (totalKeysEvaluated > maxKeys) {
        threatsDetected.push({
          vector: PollutionAttackVector.NESTED_DEPTH_OVERFLOW,
          path: `${currentPath}.${key}`,
          maliciousKey: key,
          sampleValue: `keys=${totalKeysEvaluated} > max=${maxKeys}`,
          severity: PollutionThreatSeverity.HIGH,
          description: `Contagem total de propriedades excedeu o limite máximo (${maxKeys}).`
        });
        break;
      }

      const descriptor = Object.getOwnPropertyDescriptor(node, key);
      const isGetterSetter = descriptor && (typeof descriptor.get === 'function' || typeof descriptor.set === 'function');

      if (isGetterSetter) {
        threatsDetected.push({
          vector: PollutionAttackVector.GETTER_SETTER_INJECTION,
          path: `${currentPath}.${key}`,
          maliciousKey: key,
          sampleValue: '[Getter/Setter Descriptor]',
          severity: PollutionThreatSeverity.HIGH,
          description: `Descriptor de Getter/Setter detectado em "${key}". Risco de execução oculta de código.`
        });
        if (options.stripGettersSetters ?? true) {
          continue; // Pular chave com getter/setter
        }
      }

      // Detecção de Prototype Pollution
      if (isDangerousKey(key)) {
        const severity = (key === '__proto__' || key === 'prototype')
          ? PollutionThreatSeverity.CRITICAL
          : PollutionThreatSeverity.HIGH;

        const vector = (key === '__proto__')
          ? PollutionAttackVector.PROTO_POLLUTION
          : (key === 'constructor' || key === 'prototype')
          ? PollutionAttackVector.CONSTRUCTOR_PROTOTYPE
          : PollutionAttackVector.GETTER_SETTER_INJECTION;

        threatsDetected.push({
          vector,
          path: `${currentPath}.${key}`,
          maliciousKey: key,
          sampleValue: String(node[key]).slice(0, 40),
          severity,
          description: `Tentativa de injeção direta de chave reservada do protótipo JavaScript ("${key}").`
        });

        // Se a estratégia for FAIL_FAST e tiver chave crítica, interrompe
        if (strategy === SanitizationStrategy.FAIL_FAST_REJECT) {
          continue;
        }

        // Se for STRIP ou NULL_PROTOTYPE_FREEZE, ignoramos a chave
        continue;
      }

      // Copiar de forma segura
      const subValue = (node as any)[key];
      sanitizedObj[key] = inspectAndClone(subValue, currentPath ? `${currentPath}.${key}` : key, currentDepth + 1);
    }

    return sanitizedObj;
  }

  // Executar varredura
  let sanitizedResult = inspectAndClone(payload, '', 0);

  // Se a estratégia for FAIL_FAST e detectou ameaça crítica, não retorna payload
  const hasCritical = threatsDetected.some(t => t.severity === PollutionThreatSeverity.CRITICAL);
  if (strategy === SanitizationStrategy.FAIL_FAST_REJECT && hasCritical) {
    sanitizedResult = null;
  } else if (shouldFreeze && sanitizedResult !== null && typeof sanitizedResult === 'object') {
    safeFreezeRecursively(sanitizedResult);
  }

  const endTime = process.hrtime.bigint();
  const processingTimeMs = Number(endTime - startTime) / 1_000_000;

  const isClean = threatsDetected.length === 0;

  // Emitir selo WORM
  const proofSeal = createPollutionProofSeal({
    scanId,
    category,
    threatsCount: threatsDetected.length,
    isClean,
    timestamp
  });

  const message = isClean
    ? 'Payload clínico 100% íntegro e livre de vetores de poluição de protótipo.'
    : `Detectadas e mitigadas ${threatsDetected.length} ameaça(s) de injeção de protótipo/desserialização insegura.`;

  return {
    scanId,
    isClean,
    category,
    strategyApplied: strategy,
    threatsDetected,
    sanitizedObject: sanitizedResult,
    processingTimeMs: Number(processingTimeMs.toFixed(3)),
    maxDepthReached,
    totalKeysEvaluated,
    proofSeal,
    message
  };
}

/**
 * Função utilitária de Deep Merge Seguro.
 * Garante que fontes maliciosas nunca consigam contaminar o protótipo do alvo ou de Object.prototype.
 */
export function safeDeepMerge<T = any>(target: any, source: any, options: SanitizeOptions = {}): T {
  if (source === null || typeof source !== 'object') {
    return target;
  }

  const destination = target && typeof target === 'object'
    ? target
    : (options.strategy === SanitizationStrategy.NULL_PROTOTYPE_FREEZE ? Object.create(null) : {});

  for (const key of Object.getOwnPropertyNames(source)) {
    if (isDangerousKey(key)) {
      // Ignorar sumariamente para blindar o protótipo
      continue;
    }

    const sourceVal = source[key];
    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      destination[key] = safeDeepMerge(destination[key] || {}, sourceVal, options);
    } else if (Array.isArray(sourceVal)) {
      destination[key] = sourceVal.map(item =>
        (item && typeof item === 'object') ? safeDeepMerge({}, item, options) : item
      );
    } else {
      destination[key] = sourceVal;
    }
  }

  return destination;
}
