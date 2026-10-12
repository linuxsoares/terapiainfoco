import Redis, { type RedisOptions } from 'ioredis';

export interface RateLimitResult {
  count: number;
  resetAt: number;
}

export interface RateLimitStoreStatus {
  storeType: 'redis' | 'memory';
  connected: boolean;
  host?: string;
  totalKeys: number;
}

export interface IRateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult>;
  reset(key?: string): Promise<void>;
  getStatus(): Promise<RateLimitStoreStatus>;
}

/**
 * 1. Store In-Memory com limpeza periódica de entradas expiradas
 */
export class InMemoryRateLimitStore implements IRateLimitStore {
  private store = new Map<string, RateLimitResult>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs = 60000) {
    if (typeof setInterval !== 'undefined' && cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.purgeExpired();
      }, cleanupIntervalMs);

      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }
  }

  public async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetAt) {
      const newRecord = { count: 1, resetAt: now + windowMs };
      this.store.set(key, newRecord);
      return newRecord;
    }

    record.count++;
    return record;
  }

  public async reset(key?: string): Promise<void> {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  public async getStatus(): Promise<RateLimitStoreStatus> {
    this.purgeExpired();
    return {
      storeType: 'memory',
      connected: true,
      totalKeys: this.store.size
    };
  }

  public purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [k, v] of this.store.entries()) {
      if (now > v.resetAt) {
        this.store.delete(k);
        purged++;
      }
    }
    return purged;
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

/**
 * Script Lua Atômico para Redis:
 * Garante incremento e definição de PEXPIRE no primeiro acesso de forma 100% indivisível.
 * Evita race conditions em clusters multi-instâncias de API.
 */
const LUA_RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

/**
 * 2. Store Redis com Scripts Lua Atômicos para Clusters Distribuídos
 */
export class RedisRateLimitStore implements IRateLimitStore {
  private client: Redis;
  private isConnected = false;
  private prefix: string;

  constructor(clientOrUrl?: Redis | string, options?: RedisOptions) {
    this.prefix = 'ratelimit:';

    if (clientOrUrl instanceof Redis) {
      this.client = clientOrUrl;
      this.isConnected = true;
    } else if (typeof clientOrUrl === 'string') {
      this.client = new Redis(clientOrUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        ...options
      });
    } else {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        ...options
      });
    }

    this.client.on('connect', () => { this.isConnected = true; });
    this.client.on('ready', () => { this.isConnected = true; });
    this.client.on('error', () => { this.isConnected = false; });
    this.client.on('close', () => { this.isConnected = false; });
  }

  public async connect(): Promise<void> {
    if (!this.isConnected && this.client.status !== 'ready' && this.client.status !== 'connecting') {
      await this.client.connect().catch(() => {
        this.isConnected = false;
      });
    }
  }

  public async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}${key}`;
    const now = Date.now();

    // Executa script Lua atômico
    const result = await this.client.eval(
      LUA_RATE_LIMIT_SCRIPT,
      1,
      fullKey,
      windowMs.toString()
    ) as [number, number];

    const count = Number(result[0]);
    const ttlMs = Math.max(0, Number(result[1]));
    const resetAt = now + ttlMs;

    return { count, resetAt };
  }

  public async reset(key?: string): Promise<void> {
    if (key) {
      await this.client.del(`${this.prefix}${key}`);
    } else {
      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    }
  }

  public async getStatus(): Promise<RateLimitStoreStatus> {
    let keysCount = 0;
    try {
      if (this.isConnected) {
        const keys = await this.client.keys(`${this.prefix}*`);
        keysCount = keys.length;
      }
    } catch {
      // Ignora erro de contagem se desconectado
    }

    return {
      storeType: 'redis',
      connected: this.isConnected,
      host: (this.client.options as any)?.host || 'redis-cluster',
      totalKeys: keysCount
    };
  }

  public getRedisClient(): Redis {
    return this.client;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/**
 * 3. Store Resiliente com Fallback Automático (Circuit Breaker)
 * 
 * Se o Redis estiver acessível e conectado, utiliza o Redis para sincronia distribuída.
 * Se o Redis falhar, desconectar ou não estiver configurado, faz degradação suave (graceful degradation)
 * imediata para o InMemoryRateLimitStore local sem travar ou interromper a aplicação.
 */
export class ResilientRateLimitStore implements IRateLimitStore {
  private inMemoryStore: InMemoryRateLimitStore;
  private redisStore: RedisRateLimitStore | null = null;
  private forceMemoryFallback = false;

  constructor(redisClientOrUrl?: Redis | string) {
    this.inMemoryStore = new InMemoryRateLimitStore();

    if (redisClientOrUrl || process.env.REDIS_URL) {
      try {
        this.redisStore = new RedisRateLimitStore(redisClientOrUrl);
      } catch {
        this.redisStore = null;
      }
    }
  }

  public setForceMemoryFallback(force: boolean): void {
    this.forceMemoryFallback = force;
  }

  public setRedisStore(store: RedisRateLimitStore | null): void {
    this.redisStore = store;
  }

  public async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    if (this.redisStore && !this.forceMemoryFallback) {
      try {
        return await this.redisStore.increment(key, windowMs);
      } catch {
        // Falha no Redis detectada: degrada para In-Memory
      }
    }

    return await this.inMemoryStore.increment(key, windowMs);
  }

  public async reset(key?: string): Promise<void> {
    const promises: Promise<void>[] = [this.inMemoryStore.reset(key)];
    if (this.redisStore && !this.forceMemoryFallback) {
      promises.push(this.redisStore.reset(key).catch(() => {}));
    }
    await Promise.all(promises);
  }

  public async getStatus(): Promise<RateLimitStoreStatus> {
    if (this.redisStore && !this.forceMemoryFallback) {
      try {
        const redisStatus = await this.redisStore.getStatus();
        if (redisStatus.connected) {
          return redisStatus;
        }
      } catch {
        // Fallback para status in-memory
      }
    }

    return await this.inMemoryStore.getStatus();
  }

  public getInMemoryStore(): InMemoryRateLimitStore {
    return this.inMemoryStore;
  }

  public getRedisStore(): RedisRateLimitStore | null {
    return this.redisStore;
  }
}

// Instância singleton global do store resiliente
export const globalRateLimitStore = new ResilientRateLimitStore();
