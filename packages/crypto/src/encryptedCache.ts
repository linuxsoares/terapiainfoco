import { generateRandomKey, encryptAesGcm, decryptAesGcm } from './cipher';
import type { EncryptedPayload } from '@terapiainfoco/shared';

export interface CacheEntry {
  encryptedPayload: EncryptedPayload;
  expiresAt: number; // timestamp em ms (0 para sem expiração)
  createdAt: number;
}

export interface EncryptedCacheStats {
  totalKeys: number;
  hits: number;
  misses: number;
  hitRatio: number;
  encryptionAlgorithm: 'aes-256-gcm';
  keyRotationAgeSeconds: number;
  itemsInMemoryEncrypted: number;
  memorySizeBytesEstimate: number;
}

/**
 * Cache Criptográfico em Memória (Encrypted In-Memory Cache)
 * 
 * Protege dados clínicos e temporários voláteis em memória RAM com AES-256-GCM.
 * Previne vazamento de PII em caso de inspeção de heap memory, core dumps ou
 * ataques de canal lateral em ambientes multi-tenant e pods compartilhados.
 */
export class EncryptedInMemoryCache {
  private store = new Map<string, CacheEntry>();
  private currentKey: Buffer;
  private keyCreatedAt: number;
  private hits = 0;
  private misses = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs = 60000) {
    this.currentKey = generateRandomKey(32);
    this.keyCreatedAt = Date.now();

    // Limpeza periódica em segundo plano de itens expirados
    if (typeof setInterval !== 'undefined' && cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.purgeExpired();
      }, cleanupIntervalMs);

      // Desassocia o timer para não segurar o runtime do processo
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Armazena um valor no cache serializado em JSON e cifrado com AES-256-GCM
   * @param key Chave de busca
   * @param value Objeto ou valor a ser armazenado
   * @param ttlMs Tempo de vida em milissegundos (padrão: 5 minutos = 300000ms)
   */
  public set<T>(key: string, value: T, ttlMs = 300000): void {
    const serialized = JSON.stringify(value);
    const encryptedPayload = encryptAesGcm(serialized, this.currentKey);
    const now = Date.now();

    this.store.set(key, {
      encryptedPayload,
      expiresAt: ttlMs > 0 ? now + ttlMs : 0,
      createdAt: now
    });
  }

  /**
   * Recupera e decripta um valor do cache com validação de Auth Tag GCM
   */
  public get<T>(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (entry.expiresAt > 0 && now > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    try {
      const decryptedPlaintext = decryptAesGcm(entry.encryptedPayload, this.currentKey);
      const parsed = JSON.parse(decryptedPlaintext) as T;
      this.hits++;
      return parsed;
    } catch {
      // Se a integridade falhar (adulteração de memória ou chave inválida), descarta o item
      this.store.delete(key);
      this.misses++;
      return null;
    }
  }

  /**
   * Remove uma chave do cache
   */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Verifica se a chave existe e não está expirada
   */
  public has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Esvazia todo o cache
   */
  public clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove todas as entradas com TTL expirado
   */
  public purgeExpired(): number {
    const now = Date.now();
    let purgedCount = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.store.delete(key);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  /**
   * Rotaciona a DEK em RAM e re-criptografa atômica e seguramente todas as entradas ativas
   */
  public rotateKey(): void {
    const oldKey = this.currentKey;
    const newKey = generateRandomKey(32);
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      // Ignora itens expirados
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }

      try {
        const plaintext = decryptAesGcm(entry.encryptedPayload, oldKey);
        entry.encryptedPayload = encryptAesGcm(plaintext, newKey);
      } catch {
        this.store.delete(key);
      }
    }

    // Zeroiza chave antiga em memória por segurança
    oldKey.fill(0);
    this.currentKey = newKey;
    this.keyCreatedAt = Date.now();
  }

  /**
   * Retorna estatísticas de observabilidade do cache criptográfico
   */
  public getStats(): EncryptedCacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? Number(((this.hits / totalRequests) * 100).toFixed(2)) : 0;
    const ageSeconds = Math.floor((Date.now() - this.keyCreatedAt) / 1000);

    // Estimativa de bytes ocupados pelos payloads cifrados em memória
    let estimatedBytes = 0;
    for (const entry of this.store.values()) {
      estimatedBytes += entry.encryptedPayload.ciphertext.length +
                        entry.encryptedPayload.iv.length +
                        entry.encryptedPayload.authTag.length;
    }

    return {
      totalKeys: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      encryptionAlgorithm: 'aes-256-gcm',
      keyRotationAgeSeconds: ageSeconds,
      itemsInMemoryEncrypted: this.store.size,
      memorySizeBytesEstimate: estimatedBytes
    };
  }

  /**
   * Destrói o timer de limpeza (para encerramento limpo em testes)
   */
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.currentKey.fill(0);
    this.store.clear();
  }
}

export const globalEncryptedCache = new EncryptedInMemoryCache();
