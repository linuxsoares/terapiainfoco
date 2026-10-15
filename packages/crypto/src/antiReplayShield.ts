import crypto from 'node:crypto';
import {
  ReplayDefenseMode,
  ReplayThreatSeverity,
  ReplayTargetProtocol
} from '@terapiainfoco/shared';
import type {
  ReplayVerificationResult,
  SlidingWindowStatus,
  BloomFilterMetrics,
  AntiReplayProofSeal
} from '@terapiainfoco/shared';

const ANTI_REPLAY_WORM_SECRET = process.env.ANTI_REPLAY_WORM_SECRET || 'terapiainfoco_anti_replay_shield_worm_key_2026';

/**
 * Canonicalização determinística JSON conforme RFC 8785 (JCS)
 */
function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return '{' + parts.join(',') + '}';
}

// =========================================================================
// 1. JANELA DESLIZANTE ANTI-REPLAY DE 64/128 BITS (RFC 6479 & RFC 4303)
// =========================================================================

export class SlidingWindowAntiReplay {
  public readonly channelId: string;
  public readonly windowSize: number; // 64 ou 128 bits
  private highestSeq: number = 0;
  private bitmap: bigint = 0n;

  // Contadores de telemetria
  private packetsAcceptedCount: number = 0;
  private packetsReplayedCount: number = 0;
  private packetsOutOfWindowCount: number = 0;

  constructor(channelId: string, windowSize: 64 | 128 = 64) {
    this.channelId = channelId;
    this.windowSize = windowSize;
  }

  /**
   * Avalia e registra um número de sequência contra a janela deslizante
   */
  public checkAndMark(seq: number): {
    allowed: boolean;
    severity: ReplayThreatSeverity;
    reason: string;
    position: {
      sequenceNumber: number;
      highestSequence: number;
      windowSize: number;
      inWindow: boolean;
      bitIndex: number;
    };
  } {
    if (seq <= 0) {
      return {
        allowed: false,
        severity: ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED,
        reason: 'Número de sequência inválido (deve ser estritamente positivo)',
        position: {
          sequenceNumber: seq,
          highestSequence: this.highestSeq,
          windowSize: this.windowSize,
          inWindow: false,
          bitIndex: -1
        }
      };
    }

    // Caso 1: Primeiro pacote recebido
    if (this.highestSeq === 0) {
      this.highestSeq = seq;
      this.bitmap = 1n; // Bit 0 setado
      this.packetsAcceptedCount++;
      return {
        allowed: true,
        severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
        reason: 'Primeiro pacote da sessão registrado com sucesso',
        position: {
          sequenceNumber: seq,
          highestSequence: this.highestSeq,
          windowSize: this.windowSize,
          inWindow: true,
          bitIndex: 0
        }
      };
    }

    // Caso 2: Pacote novo à frente da janela (seq > highestSeq)
    if (seq > this.highestSeq) {
      const delta = seq - this.highestSeq;
      if (delta >= this.windowSize) {
        // Salto maior que a janela inteira: redefine o bitmap
        this.bitmap = 1n;
      } else {
        // Desliza a janela para a esquerda por delta bits e adiciona 1 no bit 0
        this.bitmap = (this.bitmap << BigInt(delta)) | 1n;
        // Trunca o bitmap para o tamanho da janela
        const mask = (1n << BigInt(this.windowSize)) - 1n;
        this.bitmap &= mask;
      }
      this.highestSeq = seq;
      this.packetsAcceptedCount++;
      return {
        allowed: true,
        severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
        reason: `Pacote em sequência aceito (|seq - max| = +${delta}). Janela avançada.`,
        position: {
          sequenceNumber: seq,
          highestSequence: this.highestSeq,
          windowSize: this.windowSize,
          inWindow: true,
          bitIndex: 0
        }
      };
    }

    // Caso 3: Pacote retroativo ou reordenado (seq <= highestSeq)
    const diff = this.highestSeq - seq;

    // Se estiver fora da janela tolerada
    if (diff >= this.windowSize) {
      this.packetsOutOfWindowCount++;
      return {
        allowed: false,
        severity: ReplayThreatSeverity.OUT_OF_WINDOW_EXPIRED,
        reason: `Pacote atrasado além do limite tolerável da janela (diff = ${diff} >= ${this.windowSize}). Descarte preventivo.`,
        position: {
          sequenceNumber: seq,
          highestSequence: this.highestSeq,
          windowSize: this.windowSize,
          inWindow: false,
          bitIndex: diff
        }
      };
    }

    // Se estiver dentro da janela tolerada (0 <= diff < windowSize)
    const bitMask = 1n << BigInt(diff);
    if ((this.bitmap & bitMask) !== 0n) {
      // Bit já setado: ataque de replay duplicado!
      this.packetsReplayedCount++;
      return {
        allowed: false,
        severity: ReplayThreatSeverity.DUPLICATE_REPLAY_DETECTED,
        reason: `Ataque de Replay detectado: o pacote seq=${seq} já foi processado anteriormente (bit ${diff} ativo).`,
        position: {
          sequenceNumber: seq,
          highestSequence: this.highestSeq,
          windowSize: this.windowSize,
          inWindow: true,
          bitIndex: diff
        }
      };
    }

    // Pacote fora de ordem aceito dentro da janela tolerada
    this.bitmap |= bitMask;
    this.packetsAcceptedCount++;
    return {
      allowed: true,
      severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
      reason: `Pacote reordenado recebido dentro da janela tolerável (bit ${diff} marcado).`,
      position: {
        sequenceNumber: seq,
        highestSequence: this.highestSeq,
        windowSize: this.windowSize,
        inWindow: true,
        bitIndex: diff
      }
    };
  }

  /**
   * Retorna o estado atual da Janela Deslizante
   */
  public getStatus(): SlidingWindowStatus {
    const lowest = Math.max(1, this.highestSeq - this.windowSize + 1);
    return {
      channelId: this.channelId,
      windowSize: this.windowSize,
      highestSequenceNumber: this.highestSeq,
      lowestAcceptableSequenceNumber: lowest,
      bitmapHex: '0x' + this.bitmap.toString(16),
      packetsAccepted: this.packetsAcceptedCount,
      packetsReplayed: this.packetsReplayedCount,
      packetsOutOfWindow: this.packetsOutOfWindowCount,
      lastUpdated: new Date().toISOString()
    };
  }
}

// =========================================================================
// 2. FILTRO DE BLOOM ROTATIVO TEMPORAL (TIME-DECAYING ROTATING BLOOM FILTER)
// =========================================================================

/**
 * Hash FNV-1a de 32 bits
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Hash tipo Murmur3 simplificado de 32 bits
 */
function murmur3Like32(str: string): number {
  let h = 0x9747b28c;
  for (let i = 0; i < str.length; i++) {
    let k = str.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }
  h ^= str.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class RotatingBloomFilter {
  private sizeBits: number; // M bits
  private numHashFunctions: number; // K funções
  private currentBitArray: Uint8Array;
  private previousBitArray: Uint8Array | null = null;

  private currentElementsCount: number = 0;
  private activeGeneration: number = 1;
  private lastRotatedAt: string;

  private totalEvaluated: number = 0;
  private totalBlocked: number = 0;

  constructor(capacity: number = 10000, falsePositiveRate: number = 0.001) {
    // Fórmulas teóricas ótimas de Bloom Filter:
    // m = - (n * ln(p)) / (ln(2)^2)
    // k = (m / n) * ln(2)
    const m = Math.ceil(-1 * (capacity * Math.log(falsePositiveRate)) / Math.pow(Math.LN2, 2));
    this.sizeBits = Math.max(1024, m);
    this.numHashFunctions = Math.max(3, Math.round((this.sizeBits / capacity) * Math.LN2));

    const byteLength = Math.ceil(this.sizeBits / 8);
    this.currentBitArray = new Uint8Array(byteLength);
    this.lastRotatedAt = new Date().toISOString();
  }

  /**
   * Obtém os k índices de bits correspondentes a um valor
   */
  private getBitIndices(value: string): number[] {
    const h1 = fnv1a32(value);
    const h2 = murmur3Like32(value);
    const indices: number[] = [];

    for (let i = 0; i < this.numHashFunctions; i++) {
      // Double Hashing de Kirsch-Mitzenmacher
      const combined = (h1 + i * h2) >>> 0;
      indices.push(combined % this.sizeBits);
    }
    return indices;
  }

  /**
   * Testa se um valor existe em um array de bits
   */
  private testBitArray(array: Uint8Array, indices: number[]): boolean {
    for (const idx of indices) {
      const byteIdx = Math.floor(idx / 8);
      const bitOffset = idx % 8;
      if ((array[byteIdx] & (1 << bitOffset)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Seta os bits no array ativo
   */
  private setBitArray(indices: number[]): void {
    for (const idx of indices) {
      const byteIdx = Math.floor(idx / 8);
      const bitOffset = idx % 8;
      this.currentBitArray[byteIdx] |= (1 << bitOffset);
    }
  }

  /**
   * Verifica se o Nonce já foi registrado (se existir, é Replay!)
   */
  public has(value: string): boolean {
    this.totalEvaluated++;
    const indices = this.getBitIndices(value);

    // Testa geração atual
    if (this.testBitArray(this.currentBitArray, indices)) {
      this.totalBlocked++;
      return true;
    }

    // Testa geração anterior para transições suaves de janela
    if (this.previousBitArray && this.testBitArray(this.previousBitArray, indices)) {
      this.totalBlocked++;
      return true;
    }

    return false;
  }

  /**
   * Adiciona o Nonce ao filtro de Bloom da geração ativa
   */
  public add(value: string): void {
    const indices = this.getBitIndices(value);
    this.setBitArray(indices);
    this.currentElementsCount++;

    // Auto-rotação se atingir 80% da capacidade teórica
    const saturation = this.currentElementsCount / (this.sizeBits / this.numHashFunctions);
    if (saturation > 0.8) {
      this.rotate();
    }
  }

  /**
   * Força a rotação de geração do Filtro de Bloom
   */
  public rotate(): { activeGeneration: number; message: string } {
    this.previousBitArray = this.currentBitArray;
    this.currentBitArray = new Uint8Array(Math.ceil(this.sizeBits / 8));
    this.currentElementsCount = 0;
    this.activeGeneration++;
    this.lastRotatedAt = new Date().toISOString();

    return {
      activeGeneration: this.activeGeneration,
      message: `Filtro de Bloom rotacionado com sucesso para a Geração ${this.activeGeneration}.`
    };
  }

  /**
   * Retorna telemetria e métricas do filtro de Bloom
   */
  public getMetrics(): BloomFilterMetrics {
    const m = this.sizeBits;
    const k = this.numHashFunctions;
    const n = this.currentElementsCount;
    // p ≈ (1 - e^(-kn/m))^k
    const p = Math.pow(1 - Math.exp((-1 * k * n) / m), k);
    const saturation = Math.min(100, parseFloat(((n / (m / k)) * 100).toFixed(2)));

    return {
      capacity: Math.round(m / k),
      elementCount: this.currentElementsCount,
      hashFunctionsCount: this.numHashFunctions,
      falsePositiveProbability: parseFloat(p.toFixed(6)),
      saturationPercentage: saturation,
      activeGeneration: this.activeGeneration,
      lastRotatedAt: this.lastRotatedAt,
      totalNoncesEvaluated: this.totalEvaluated,
      totalReplaysBlocked: this.totalBlocked
    };
  }
}

// =========================================================================
// 3. DETECTOR DE REUTILIZAÇÃO DE NONCE/IV AES-GCM (GHASH INTEGRITY GUARD)
// =========================================================================

export class NonceReuseDetector {
  private readonly bloomFilter: RotatingBloomFilter;
  private readonly recentIvMap: Map<string, number> = new Map(); // keyId:iv -> timestamp

  constructor() {
    this.bloomFilter = new RotatingBloomFilter(15000, 0.0001);
  }

  /**
   * Avalia a singularidade de um par (keyId, IV) para criptografia AES-GCM
   */
  public verifyAndRegisterIv(keyId: string, ivHex: string): {
    unique: boolean;
    severity: ReplayThreatSeverity;
    reason: string;
  } {
    const key = `${keyId}:${ivHex}`;

    // 1. Checagem em Map estrito de curto prazo (zero falso positivo)
    if (this.recentIvMap.has(key)) {
      return {
        unique: false,
        severity: ReplayThreatSeverity.CRITICAL_NONCE_REUSE,
        reason: `VIOLAÇÃO CRÍTICA NIST SP 800-38D: O IV '${ivHex}' já foi utilizado anteriormente para a chave '${keyId}'. Reutilização bloqueada para impedir ataque GHASH.`
      };
    }

    // 2. Checagem no filtro de Bloom para proteção de longo prazo
    if (this.bloomFilter.has(key)) {
      return {
        unique: false,
        severity: ReplayThreatSeverity.CRITICAL_NONCE_REUSE,
        reason: `ALERTA DE REUTILIZAÇÃO DE NONCE: O IV '${ivHex}' coincide com assinatura probabilística histórica da chave '${keyId}'. Operação bloqueada.`
      };
    }

    // Registra o par (keyId, iv)
    this.recentIvMap.set(key, Date.now());
    this.bloomFilter.add(key);

    // Limpeza de itens com mais de 30 minutos no map
    if (this.recentIvMap.size > 20000) {
      const now = Date.now();
      for (const [k, ts] of this.recentIvMap.entries()) {
        if (now - ts > 1800000) {
          this.recentIvMap.delete(k);
        }
      }
    }

    return {
      unique: true,
      severity: ReplayThreatSeverity.BENIGN_IN_ORDER,
      reason: `IV '${ivHex}' único e conforme com a política de integridade AES-GCM.`
    };
  }

  public getBloomMetrics(): BloomFilterMetrics {
    return this.bloomFilter.getMetrics();
  }

  public rotateBloom(): { activeGeneration: number; message: string } {
    return this.bloomFilter.rotate();
  }
}

// =========================================================================
// 4. SELO PROBATÓRIO WORM HMAC-SHA256 & JCS RFC 8785
// =========================================================================

/**
 * Emite Selo Probatório WORM de Mitigação Anti-Replay
 */
export function issueAntiReplayProofSeal(
  verificationId: string,
  protocol: ReplayTargetProtocol,
  mode: ReplayDefenseMode,
  payload: any
): AntiReplayProofSeal {
  const canonicalData = canonicalStringify(payload);
  const canonicalDigest = crypto.createHash('sha256').update(canonicalData).digest('hex');

  const hmacSignature = crypto.createHmac('sha256', ANTI_REPLAY_WORM_SECRET)
    .update(`ANTI_REPLAY_PROOF_V1:${verificationId}:${protocol}:${mode}:${canonicalDigest}`)
    .digest('hex');

  const issuedAt = new Date().toISOString();
  const sealToken = `anti_replay_proof_v1_${Buffer.from(JSON.stringify({
    id: verificationId,
    proto: protocol,
    mod: mode,
    dig: canonicalDigest,
    sig: hmacSignature,
    ts: issuedAt
  })).toString('base64url')}`;

  return {
    sealToken,
    canonicalDigest,
    hmacSignature,
    issuedAt,
    verificationId,
    protocol,
    mode
  };
}

/**
 * Verifica a autenticidade e não-adulteração de um Selo Probatório Anti-Replay
 */
export function verifyAntiReplayProofSeal(sealToken: string): {
  valid: boolean;
  seal?: AntiReplayProofSeal;
  message: string;
} {
  try {
    if (!sealToken.startsWith('anti_replay_proof_v1_')) {
      return { valid: false, message: 'Prefixo de token de selo anti-replay inválido.' };
    }

    const b64 = sealToken.replace('anti_replay_proof_v1_', '');
    const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));

    const expectedSig = crypto.createHmac('sha256', ANTI_REPLAY_WORM_SECRET)
      .update(`ANTI_REPLAY_PROOF_V1:${decoded.id}:${decoded.proto}:${decoded.mod}:${decoded.dig}`)
      .digest('hex');

    const valid = expectedSig === decoded.sig;

    if (!valid) {
      return { valid: false, message: 'Assinatura HMAC-SHA256 do selo anti-replay diverge ou foi adulterada.' };
    }

    const seal: AntiReplayProofSeal = {
      sealToken,
      canonicalDigest: decoded.dig,
      hmacSignature: decoded.sig,
      issuedAt: decoded.ts,
      verificationId: decoded.id,
      protocol: decoded.proto,
      mode: decoded.mod
    };

    return {
      valid: true,
      seal,
      message: 'Selo probatório anti-replay 100% autêntico e inviolado (WORM RFC 8785).'
    };
  } catch (err: any) {
    return {
      valid: false,
      message: `Erro ao decodificar selo anti-replay: ${err.message}`
    };
  }
}
