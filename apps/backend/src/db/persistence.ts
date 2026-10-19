import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDb } from './index';
import { entityStore } from './schema';

/**
 * Persistência durável das coleções de domínio (ADR-004 do RFC-001).
 *
 * As coleções do `memoryDb` continuam sendo a API síncrona usada pelos services, mas
 * passam a funcionar como cache de uma fonte de verdade no PostgreSQL:
 *  - no boot, `attach()` carrega todas as entidades da tabela `entity_store`;
 *  - ao final de cada requisição, `flush()` grava em uma transação toda entidade
 *    criada, alterada (inclusive mutações in-place) ou removida desde a última gravação;
 *  - um flush periódico cobre mutações feitas fora de requisições (jobs/timers) e uma
 *    varredura completa periódica cobre referências mutadas após o flush da requisição.
 *
 * A detecção de mudanças compara a serialização atual de cada entidade com a última
 * serialização persistida, apenas nas coleções acessadas desde o último flush.
 */

const BATCH_SIZE = 500;

interface CollectedChanges {
  upserts: [id: string, json: string][];
  deletes: string[];
  onCommit(): void;
  onFail(): void;
}

export interface CollectionSource {
  name: string;
  /** Itens imutáveis: o snapshot guarda só a presença do id, sem a serialização */
  appendOnly?: boolean;
  /** Mudanças desde o snapshot, ou null quando a coleção não foi acessada (e `full` é false) */
  collect(snapshot: Map<string, string>, full: boolean): CollectedChanges | null;
  entries(): Iterable<[string, unknown]>;
  /** Substitui o conteúdo em memória pelas entidades persistidas */
  load(entries: [string, unknown][]): void;
  /** Acrescenta entidades ausentes da memória (sem sobrescrever as existentes); devolve as acrescentadas */
  merge?(entries: [string, unknown][]): [string, unknown][];
}

/** Map que sinaliza qualquer acesso, permitindo pular o diff de coleções intocadas */
export class TrackedMap<K, V> extends Map<K, V> {
  touched = true;

  override get(key: K): V | undefined { this.touched = true; return super.get(key); }
  override set(key: K, value: V): this { this.touched = true; return super.set(key, value); }
  override delete(key: K): boolean { this.touched = true; return super.delete(key); }
  override clear(): void { this.touched = true; super.clear(); }
  override values(): MapIterator<V> { this.touched = true; return super.values(); }
  override entries(): MapIterator<[K, V]> { this.touched = true; return super.entries(); }
  override forEach(cb: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.touched = true;
    super.forEach(cb, thisArg);
  }
  override [Symbol.iterator](): MapIterator<[K, V]> { this.touched = true; return super[Symbol.iterator](); }
}

/** Set que sinaliza mutações */
export class TrackedSet<T> extends Set<T> {
  touched = true;

  override add(value: T): this { this.touched = true; return super.add(value); }
  override delete(value: T): boolean { this.touched = true; return super.delete(value); }
  override clear(): void { this.touched = true; super.clear(); }
}

/** Diff completo de entidades contra o snapshot */
function diffEntries(entries: Iterable<[string, unknown]>, snapshot: Map<string, string>) {
  const upserts: [string, string][] = [];
  const seen = new Set<string>();
  for (const [id, value] of entries) {
    seen.add(id);
    const json = encode(value);
    if (snapshot.get(id) !== json) upserts.push([id, json]);
  }
  const deletes = [...snapshot.keys()].filter((id) => !seen.has(id));
  return { upserts, deletes };
}

export function mapSource(name: string, getMap: () => TrackedMap<string, any>): CollectionSource {
  const rawEntries = () => Map.prototype.entries.call(getMap()) as Iterable<[string, unknown]>;
  return {
    name,
    collect(snapshot, full) {
      const map = getMap();
      if (!full && !map.touched) return null;
      map.touched = false;
      try {
        return { ...diffEntries(rawEntries(), snapshot), onCommit() {}, onFail() { map.touched = true; } };
      } catch (err) {
        map.touched = true;
        throw err;
      }
    },
    entries: rawEntries,
    load(entries) {
      const map = getMap();
      Map.prototype.clear.call(map);
      for (const [id, value] of entries) Map.prototype.set.call(map, id, value);
      map.touched = false;
    },
    merge(entries) {
      const map = getMap();
      const added = entries.filter(([id]) => !Map.prototype.has.call(map, id));
      for (const [id, value] of added) Map.prototype.set.call(map, id, value);
      return added;
    }
  };
}

export function setSource(name: string, getSet: () => TrackedSet<string>): CollectionSource {
  function* rawEntries(): Iterable<[string, unknown]> {
    for (const value of Set.prototype.values.call(getSet()) as Iterable<string>) yield [value, true];
  }
  return {
    name,
    collect(snapshot, full) {
      const set = getSet();
      if (!full && !set.touched) return null;
      set.touched = false;
      return { ...diffEntries(rawEntries(), snapshot), onCommit() {}, onFail() { set.touched = true; } };
    },
    entries: rawEntries,
    load(entries) {
      const set = getSet();
      Set.prototype.clear.call(set);
      for (const [id] of entries) Set.prototype.add.call(set, id);
      set.touched = false;
    }
  };
}

/**
 * Lista append-only de itens imutáveis identificados por `id` (trilha de auditoria).
 * Enquanto o array não é substituído, só a cauda nova é serializada.
 */
export function appendOnlySource<T extends { id: string }>(
  name: string,
  getList: () => T[],
  setList: (list: T[]) => void,
  sortKey: (item: T) => number
): CollectionSource {
  let persistedList: T[] | undefined;
  let persistedLength = 0;

  return {
    name,
    appendOnly: true,
    collect(snapshot, full) {
      const list = getList();
      const length = list.length;
      const commit = { onCommit() { persistedList = list; persistedLength = length; }, onFail() {} };
      if (list === persistedList && length >= persistedLength) {
        if (!full && length === persistedLength) return null;
        return { upserts: list.slice(persistedLength).map((item) => [item.id, encode(item)]), deletes: [], ...commit };
      }
      // Array substituído (reset / restauração de backup): diff por id
      const ids = new Set<string>();
      const upserts: [string, string][] = [];
      for (const item of list) {
        ids.add(item.id);
        if (!snapshot.has(item.id)) upserts.push([item.id, encode(item)]);
      }
      const deletes = [...snapshot.keys()].filter((id) => !ids.has(id));
      return { upserts, deletes, ...commit };
    },
    entries: () => getList().map((item): [string, unknown] => [item.id, item]),
    load(entries) {
      const list = entries.map(([, value]) => value as T).sort((a, b) => sortKey(a) - sortKey(b));
      setList(list);
      persistedList = list;
      persistedLength = list.length;
    }
  };
}

/** Serializa preservando tipos não-JSON usados pelo domínio (Date, Map, Set) */
export function encode(value: unknown): string {
  return JSON.stringify(value, function (this: any, key: string, current: unknown) {
    const original = this[key];
    if (original instanceof Date) return { $date: original.toISOString() };
    if (original instanceof Map) return { $map: Array.from(original.entries()) };
    if (original instanceof Set) return { $set: Array.from(original.values()) };
    return current;
  });
}

/** Restaura os tipos marcados por `encode` em um valor já desserializado (ex: JSONB do driver) */
export function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      if (typeof obj.$date === 'string') return new Date(obj.$date);
      if (Array.isArray(obj.$map)) return new Map((obj.$map as [unknown, unknown][]).map(([k, v]) => [revive(k), revive(v)]));
      if (Array.isArray(obj.$set)) return new Set((obj.$set as unknown[]).map(revive));
    }
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = revive(obj[key]);
    return out;
  }
  return value;
}

export class EntityPersistence {
  private sources = new Map<string, CollectionSource>();
  /** Última serialização persistida de cada entidade, por coleção */
  private snapshots = new Map<string, Map<string, string>>();
  private db: AppDb | null = null;
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;

  register(source: CollectionSource): void {
    this.sources.set(source.name, source);
    this.snapshots.set(source.name, new Map());
  }

  get enabled(): boolean {
    return this.db !== null;
  }

  /** Coleção com ao menos uma entidade persistida */
  hasPersisted(name: string): boolean {
    return (this.snapshots.get(name)?.size ?? 0) > 0;
  }

  /**
   * Carrega as entidades persistidas. Coleções sem registros no banco mantêm o conteúdo
   * atual em memória (seed demo / importação legada), que é gravado no primeiro flush.
   */
  async load(db: AppDb): Promise<Record<string, number>> {
    const rows: { collection: string; id: string; data: unknown }[] = await (db as any)
      .select({ collection: entityStore.collection, id: entityStore.id, data: entityStore.data })
      .from(entityStore);

    const grouped = new Map<string, [string, unknown][]>();
    for (const row of rows) {
      if (!this.sources.has(row.collection)) {
        console.warn(`⚠️ entity_store: coleção desconhecida ignorada (${row.collection})`);
        continue;
      }
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      grouped.set(row.collection, [...(grouped.get(row.collection) ?? []), [row.id, revive(data)]]);
    }

    const loaded: Record<string, number> = {};
    for (const [name, entries] of grouped) {
      const source = this.sources.get(name)!;
      source.load(entries);
      const snapshot = new Map<string, string>();
      for (const [id, value] of source.entries()) snapshot.set(id, source.appendOnly ? '' : encode(value));
      this.snapshots.set(name, snapshot);
      loaded[name] = entries.length;
    }
    return loaded;
  }

  /**
   * Traz do banco entidades gravadas por outro processo (ex.: `bun run admin:create`) que ainda
   * não estão em memória. Nunca sobrescreve o que já está carregado.
   */
  async refreshMissing(name: string): Promise<number> {
    const source = this.sources.get(name);
    if (!this.db || !source?.merge) return 0;
    const rows: { id: string; data: unknown }[] = await (this.db as any)
      .select({ id: entityStore.id, data: entityStore.data })
      .from(entityStore)
      .where(eq(entityStore.collection, name));
    const snapshot = this.snapshots.get(name)!;
    const candidates = rows
      .filter((row) => !snapshot.has(row.id))
      .map((row): [string, unknown] => [row.id, revive(typeof row.data === 'string' ? JSON.parse(row.data) : row.data)]);
    const added = source.merge(candidates);
    for (const [id, value] of added) snapshot.set(id, encode(value));
    return added.length;
  }

  /** Ativa a gravação: persiste o estado atual e inicia o flush periódico */
  async attach(db: AppDb, options: { intervalMs?: number; fullSweepEvery?: number } = {}): Promise<void> {
    this.db = db;
    await this.flush({ full: true });

    const { intervalMs = 5000, fullSweepEvery = 12 } = options;
    let ticks = 0;
    this.timer = setInterval(() => {
      ticks++;
      this.flush({ full: ticks % fullSweepEvery === 0 }).catch((err) => {
        console.error('❌ Falha no flush periódico do entity_store:', err);
      });
    }, intervalMs);
    (this.timer as any).unref?.();
  }

  /** Para o flush periódico e desconecta, gravando as mudanças pendentes */
  async detach(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush({ full: true }).catch(() => {});
    this.db = null;
    for (const name of this.snapshots.keys()) this.snapshots.set(name, new Map());
  }

  /**
   * Grava as mudanças pendentes. Chamadas concorrentes são serializadas e cada chamada
   * inclui toda mutação feita antes dela. Em caso de erro nada é marcado como persistido
   * e as mudanças são tentadas novamente no próximo flush.
   */
  flush(options: { full?: boolean } = {}): Promise<void> {
    if (!this.db) return Promise.resolve();
    const run = this.chain.then(() => this.flushNow(options.full ?? false));
    this.chain = run.catch(() => {});
    return run;
  }

  private async flushNow(full: boolean): Promise<void> {
    const db = this.db;
    if (!db) return;

    const collected: { source: CollectionSource; changes: CollectedChanges }[] = [];
    try {
      for (const source of this.sources.values()) {
        const changes = source.collect(this.snapshots.get(source.name)!, full);
        if (changes) collected.push({ source, changes });
      }
    } catch (err) {
      collected.forEach(({ changes }) => changes.onFail());
      throw err;
    }

    const pending = collected.filter(({ changes }) => changes.upserts.length > 0 || changes.deletes.length > 0);
    if (pending.length > 0) {
      try {
        await (db as any).transaction(async (tx: any) => {
          for (const { source, changes } of pending) {
            for (let i = 0; i < changes.upserts.length; i += BATCH_SIZE) {
              await tx
                .insert(entityStore)
                .values(changes.upserts.slice(i, i + BATCH_SIZE).map(([id, json]) => ({
                  collection: source.name,
                  id,
                  data: sql`${json}::jsonb`,
                  updatedAt: new Date()
                })))
                .onConflictDoUpdate({
                  target: [entityStore.collection, entityStore.id],
                  set: { data: sql`excluded.data`, updatedAt: sql`excluded.updated_at` }
                });
            }
            for (let i = 0; i < changes.deletes.length; i += BATCH_SIZE) {
              await tx
                .delete(entityStore)
                .where(and(
                  eq(entityStore.collection, source.name),
                  inArray(entityStore.id, changes.deletes.slice(i, i + BATCH_SIZE))
                ));
            }
          }
        });
      } catch (err) {
        collected.forEach(({ changes }) => changes.onFail());
        throw err;
      }
    }

    for (const { source, changes } of collected) {
      const snapshot = this.snapshots.get(source.name)!;
      for (const [id, json] of changes.upserts) snapshot.set(id, source.appendOnly ? '' : json);
      for (const id of changes.deletes) snapshot.delete(id);
      changes.onCommit();
    }
  }
}
