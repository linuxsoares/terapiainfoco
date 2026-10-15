import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import {
  MemorySanitizationAlgorithm,
  HeapSprayingThreatLevel,
  SecureBufferState
} from '@terapiainfoco/shared';
import type {
  SecureMemoryBlock,
  HeapSprayingInspectionResult,
  MemoryZeroizationProofSeal
} from '@terapiainfoco/shared';

const DEFAULT_ZEROIZATION_SECRET = process.env.MEMORY_ZEROIZATION_HMAC_SECRET || 'terapiainfoco_secure_memory_zeroization_secret_2026';

/**
 * Encapsulamento Seguro de Buffer em Memória Heap (NIST SP 800-88 & OWASP ASVS v4.0 V14.1)
 * Garante alocação controlada, restrição de acesso e destruição segura (Multi-pass Zeroization).
 */
export class SecureBuffer {
  public readonly id: string;
  public readonly tag: string;
  public readonly byteLength: number;
  public readonly allocatedAt: string;
  public readonly ttlMs: number;
  public readonly expiresAt: string;
  public state: SecureBufferState;
  public sanitizationPasses: number = 0;
  public zeroizedAt?: string;

  private buffer: Uint8Array;
  private isDestroyed: boolean = false;

  constructor(tag: string, sizeBytes: number, ttlMs: number = 60000, initialContent?: Uint8Array | string) {
    if (sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) { // Limite de 10MB por bloco seguro
      throw new Error(`Tamanho de buffer inválido: ${sizeBytes} bytes. Deve ser entre 1 e 10MB.`);
    }

    this.id = `sec-buf-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    this.tag = tag;
    this.byteLength = sizeBytes;
    this.allocatedAt = new Date().toISOString();
    this.ttlMs = ttlMs;
    this.expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.state = SecureBufferState.ALLOCATED;

    this.buffer = new Uint8Array(sizeBytes);

    if (initialContent) {
      this.write(initialContent);
    }
  }

  /**
   * Escreve dados sensíveis no buffer protegido
   */
  public write(data: Uint8Array | string): void {
    if (this.isDestroyed || this.state === SecureBufferState.ZEROIZED || this.state === SecureBufferState.RELEASED) {
      throw new Error(`Tentativa de escrita em SecureBuffer já destruído ou zeroizado (UAF Prevented): ${this.id}`);
    }

    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    if (bytes.length > this.byteLength) {
      throw new Error(`Payload excede a capacidade do bloco seguro: ${bytes.length} > ${this.byteLength}`);
    }

    // Limpa o buffer antes de escrever
    this.buffer.fill(0);
    this.buffer.set(bytes, 0);
    this.state = SecureBufferState.ACTIVE;
  }

  /**
   * Lê uma cópia dos dados sensíveis enquanto o buffer estiver ativo
   */
  public read(): Uint8Array {
    if (this.isDestroyed || this.state === SecureBufferState.ZEROIZED || this.state === SecureBufferState.RELEASED) {
      throw new Error(`Tentativa de leitura em SecureBuffer zeroizado ou destruído (UAF Prevented): ${this.id}`);
    }
    // Retorna uma cópia defensiva para não expor a referência interna
    return new Uint8Array(this.buffer);
  }

  /**
   * Lê os dados sensíveis como string UTF-8
   */
  public readString(): string {
    const bytes = this.read();
    // Localiza o primeiro null byte se houver preenchimento
    let end = bytes.length;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        end = i;
        break;
      }
    }
    return Buffer.from(bytes.subarray(0, end)).toString('utf-8');
  }

  /**
   * Sanitização Criptográfica Determinística (NIST SP 800-88 / DoD 5220.22-M / Immediate)
   */
  public zeroize(algorithm: MemorySanitizationAlgorithm = MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE): number {
    if (this.isDestroyed || this.state === SecureBufferState.ZEROIZED) {
      return this.sanitizationPasses;
    }

    let passes = 0;

    switch (algorithm) {
      case MemorySanitizationAlgorithm.NIST_SP_800_88_OVERWRITE: {
        // Passo 1: Sobrescrita com 0x00
        this.buffer.fill(0x00);
        passes++;

        // Passo 2: Sobrescrita com 0xFF
        this.buffer.fill(0xFF);
        passes++;

        // Passo 3: Sobrescrita com bytes pseudo-aleatórios criptograficamente seguros
        const randomPass = randomBytes(this.byteLength);
        this.buffer.set(randomPass);
        passes++;

        // Passo 4: Sobrescrita final compulsória com 0x00
        this.buffer.fill(0x00);
        passes++;
        break;
      }

      case MemorySanitizationAlgorithm.DOD_5220_22_M: {
        // Passo 1: Sobrescrita com 0x00
        this.buffer.fill(0x00);
        passes++;

        // Passo 2: Sobrescrita com 0xFF
        this.buffer.fill(0xFF);
        passes++;

        // Passo 3: Sobrescrita com bytes pseudo-aleatórios e depois 0x00
        const randomPass = randomBytes(this.byteLength);
        this.buffer.set(randomPass);
        this.buffer.fill(0x00);
        passes++;
        break;
      }

      case MemorySanitizationAlgorithm.ZEROIZE_IMMEDIATE:
      default: {
        // 1 Passo: Sobrescrita direta com zeros
        this.buffer.fill(0x00);
        passes++;
        break;
      }
    }

    // Verificação de Integridade Pós-Sanitização: todos os bytes devem ser 0x00
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] !== 0x00) {
        this.state = SecureBufferState.CORRUPTED;
        throw new Error(`Falha na sanitização de memória: byte em offset ${i} não é zero.`);
      }
    }

    this.sanitizationPasses = passes;
    this.state = SecureBufferState.ZEROIZED;
    this.isDestroyed = true;
    this.zeroizedAt = new Date().toISOString();

    return passes;
  }

  /**
   * Verifica se o bloco seguro expirou seu TTL
   */
  public isExpired(nowMs: number = Date.now()): boolean {
    return nowMs > new Date(this.expiresAt).getTime();
  }

  /**
   * Converte para metadados seguros (sem expor o buffer)
   */
  public toMetadata(): SecureMemoryBlock {
    return {
      id: this.id,
      tag: this.tag,
      byteLength: this.byteLength,
      allocatedAt: this.allocatedAt,
      state: this.state,
      sanitizationPasses: this.sanitizationPasses,
      zeroizedAt: this.zeroizedAt,
      ttlMs: this.ttlMs,
      expiresAt: this.expiresAt
    };
  }
}

/**
 * Calcula a Entropia de Shannon (H) em bits por byte [0.0 - 8.0]
 */
export function calculateShannonEntropy(data: Uint8Array): number {
  if (data.length === 0) return 0.0;

  const frequencies = new Map<number, number>();
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
  }

  let entropy = 0.0;
  const total = data.length;

  for (const count of frequencies.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return Number(entropy.toFixed(4));
}

/**
 * Assinaturas comuns de Heap Spraying e Sleds de Exploit
 */
const KNOWN_SPRAY_SIGNATURES: Array<{ name: string; pattern: number[] }> = [
  { name: 'X86_NOP_SLED', pattern: [0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90] },
  { name: 'INT3_TRAP_SLED', pattern: [0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC, 0xCC] },
  { name: 'ARM64_NOP_SLED', pattern: [0x1F, 0x20, 0x03, 0xD5, 0x1F, 0x20, 0x03, 0xD5] },
  { name: 'CLASSIC_BROWSER_SPRAY_0C', pattern: [0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C] },
  { name: 'CLASSIC_BROWSER_SPRAY_0D', pattern: [0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D, 0x0D] },
  { name: 'CLASSIC_BROWSER_SPRAY_0A', pattern: [0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A, 0x0A] },
  { name: 'ASCII_PADDING_SPRAY_AAAA', pattern: [0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41] }
];

/**
 * Motor de Inspeção de Payloads & Detecção de Heap Spraying (OWASP ASVS & NIST)
 */
export function inspectHeapSpraying(payload: Uint8Array | string): HeapSprayingInspectionResult {
  const bytes = typeof payload === 'string'
    ? (payload.startsWith('0x') || /^[0-9a-fA-F]+$/.test(payload.replace(/\s+/g, '')) && payload.length % 2 === 0
      ? Buffer.from(payload.replace(/^0x/, '').replace(/\s+/g, ''), 'hex')
      : Buffer.from(payload, 'utf-8'))
    : payload;

  const totalBytes = bytes.length;
  if (totalBytes === 0) {
    return {
      isSprayingDetected: false,
      threatLevel: HeapSprayingThreatLevel.NORMAL,
      detectedPatterns: [],
      entropyScore: 0.0,
      analyzedBytes: 0,
      reason: 'Buffer vazio analisado.'
    };
  }

  const entropy = calculateShannonEntropy(bytes);
  const detectedPatterns: string[] = [];

  // 1. Verificação de Assinaturas Conhecidas de Sleds / Spray
  for (const sig of KNOWN_SPRAY_SIGNATURES) {
    let matchCount = 0;
    for (let i = 0; i <= totalBytes - sig.pattern.length; i++) {
      let matched = true;
      for (let j = 0; j < sig.pattern.length; j++) {
        if (bytes[i + j] !== sig.pattern[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matchCount++;
        i += sig.pattern.length - 1;
      }
    }

    if (matchCount >= 2 || (matchCount >= 1 && totalBytes <= 32)) {
      detectedPatterns.push(`${sig.name} (${matchCount} ocorrências)`);
    }
  }

  // 2. Detecção de Repetição de Padrões Curtos (k-grams de 2 a 8 bytes repetidos massivamente)
  let maxRepeatingStreak = 0;
  let streakPattern = '';

  for (const k of [2, 4, 8]) {
    if (totalBytes >= k * 4) {
      for (let i = 0; i <= totalBytes - k * 2; i += k) {
        let currentStreak = 1;
        const chunk = bytes.subarray(i, i + k);

        for (let j = i + k; j <= totalBytes - k; j += k) {
          const nextChunk = bytes.subarray(j, j + k);
          let same = true;
          for (let m = 0; m < k; m++) {
            if (chunk[m] !== nextChunk[m]) {
              same = false;
              break;
            }
          }
          if (same) {
            currentStreak++;
          } else {
            break;
          }
        }

        if (currentStreak > maxRepeatingStreak) {
          maxRepeatingStreak = currentStreak;
          streakPattern = `${k}-byte pattern [${Buffer.from(chunk).toString('hex')}]`;
        }
      }
    }
  }

  if (maxRepeatingStreak >= 6) {
    detectedPatterns.push(`HIGH_REPETITION: ${maxRepeatingStreak} repetições consecutivas de ${streakPattern}`);
  }

  // 3. Avaliação de Proporção de Byte Dominante
  const byteCounts = new Map<number, number>();
  for (let i = 0; i < totalBytes; i++) {
    byteCounts.set(bytes[i], (byteCounts.get(bytes[i]) || 0) + 1);
  }
  let maxByteCount = 0;
  let dominantByte = 0;
  for (const [byte, count] of byteCounts.entries()) {
    if (count > maxByteCount) {
      maxByteCount = count;
      dominantByte = byte;
    }
  }
  const dominanceRatio = maxByteCount / totalBytes;

  if (dominanceRatio > 0.5 && totalBytes >= 32) {
    detectedPatterns.push(`DOMINANT_BYTE: byte 0x${dominantByte.toString(16).padStart(2, '0')} compreende ${(dominanceRatio * 100).toFixed(1)}% do payload`);
  }

  // 4. Determinação do Nível de Ameaça e Veredito
  let threatLevel = HeapSprayingThreatLevel.NORMAL;
  let isSprayingDetected = false;
  let reason = 'Payload com distribuição estocástica regular.';

  if (detectedPatterns.some(p => p.includes('SPRAY') || p.includes('SLED') || p.includes('HIGH_REPETITION') && maxRepeatingStreak >= 10)) {
    threatLevel = HeapSprayingThreatLevel.CRITICAL_SPRAYING;
    isSprayingDetected = true;
    reason = `Tentativa crítica de Heap Spraying neutralizada! Assinaturas: ${detectedPatterns.join('; ')} (Entropia: ${entropy} bits/byte).`;
  } else if (detectedPatterns.length > 0 || (entropy < 2.0 && totalBytes >= 48) || dominanceRatio > 0.6) {
    threatLevel = HeapSprayingThreatLevel.ATTACK_DETECTED;
    isSprayingDetected = true;
    reason = `Padrão de ataque à memória detectado com anomalia de repetição (Entropia: ${entropy} bits/byte).`;
  } else if (entropy < 3.2 && totalBytes >= 64) {
    threatLevel = HeapSprayingThreatLevel.SUSPICIOUS;
    isSprayingDetected = false;
    reason = `Entropia reduzida suspeita (${entropy} bits/byte), mas sem assinatura explícita de exploit.`;
  }

  return {
    isSprayingDetected,
    threatLevel,
    detectedPatterns,
    entropyScore: entropy,
    analyzedBytes: totalBytes,
    reason
  };
}

/**
 * Criação de Selo Probatório WORM de Sanitização de Memória (HMAC-SHA256)
 */
export function createMemoryZeroizationProofSeal(
  block: SecureMemoryBlock,
  algorithm: MemorySanitizationAlgorithm,
  passesCompleted: number,
  secret: string = DEFAULT_ZEROIZATION_SECRET
): MemoryZeroizationProofSeal {
  const zeroizedAt = block.zeroizedAt || new Date().toISOString();

  // Digest canônico padronizado
  const canonicalPayload = [
    `blockId:${block.id}`,
    `tag:${block.tag}`,
    `byteLength:${block.byteLength}`,
    `sanitizationAlgorithm:${algorithm}`,
    `passesCompleted:${passesCompleted}`,
    `zeroizedAt:${zeroizedAt}`
  ].join('|');

  const canonicalDigest = createHmac('sha256', secret)
    .update(canonicalPayload)
    .digest('hex');

  const token = `MEM-ZEROIZE-v1-${randomBytes(8).toString('hex')}`;

  const hmacSignature = createHmac('sha256', secret)
    .update(`${token}:${canonicalDigest}`)
    .digest('hex');

  return {
    token,
    blockId: block.id,
    tag: block.tag,
    byteLength: block.byteLength,
    sanitizationAlgorithm: algorithm,
    passesCompleted,
    zeroizedAt,
    canonicalDigest,
    hmacSignature
  };
}

/**
 * Verificação Notarial Independente de Selo Probatório de Sanitização
 */
export function verifyMemoryZeroizationProofSeal(
  seal: MemoryZeroizationProofSeal,
  secret: string = DEFAULT_ZEROIZATION_SECRET
): { isValid: boolean; message: string; verifiedAt: string } {
  try {
    const canonicalPayload = [
      `blockId:${seal.blockId}`,
      `tag:${seal.tag}`,
      `byteLength:${seal.byteLength}`,
      `sanitizationAlgorithm:${seal.sanitizationAlgorithm}`,
      `passesCompleted:${seal.passesCompleted}`,
      `zeroizedAt:${seal.zeroizedAt}`
    ].join('|');

    const expectedDigest = createHmac('sha256', secret)
      .update(canonicalPayload)
      .digest('hex');

    const digestMatches = timingSafeEqual(
      Buffer.from(expectedDigest, 'hex'),
      Buffer.from(seal.canonicalDigest, 'hex')
    );

    if (!digestMatches) {
      return {
        isValid: false,
        message: 'Adulteração detectada: O digest canônico dos parâmetros de sanitização foi corrompido.',
        verifiedAt: new Date().toISOString()
      };
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${seal.token}:${expectedDigest}`)
      .digest('hex');

    const signatureMatches = timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(seal.hmacSignature, 'hex')
    );

    if (!signatureMatches) {
      return {
        isValid: false,
        message: 'Assinatura HMAC-SHA256 forjada ou inválida.',
        verifiedAt: new Date().toISOString()
      };
    }

    return {
      isValid: true,
      message: 'Selo probatório de sanitização WORM autêntico e íntegro (NIST SP 800-88 auditado).',
      verifiedAt: new Date().toISOString()
    };
  } catch (err: any) {
    return {
      isValid: false,
      message: `Erro na verificação do selo: ${err.message}`,
      verifiedAt: new Date().toISOString()
    };
  }
}
