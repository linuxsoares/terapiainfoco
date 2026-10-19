import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { runMigrations, resolveMigrationsFolder, schema } from '../src/db';
import {
  EntityPersistence,
  TrackedMap,
  TrackedSet,
  mapSource,
  setSource,
  appendOnlySource,
  encode,
  revive
} from '../src/db/persistence';

interface Store {
  patients: TrackedMap<string, any>;
  tokens: TrackedSet<string>;
  logs: { id: string; timestamp: string; action: string }[];
}

function createStore(): Store {
  return { patients: new TrackedMap(), tokens: new TrackedSet(), logs: [] };
}

function createPersistence(store: Store): EntityPersistence {
  const persistence = new EntityPersistence();
  persistence.register(mapSource('patients', () => store.patients));
  persistence.register(setSource('tokens', () => store.tokens));
  persistence.register(appendOnlySource('logs', () => store.logs, (list) => { store.logs = list; }, (l) => Date.parse(l.timestamp)));
  return persistence;
}

describe('Persistência durável do entity_store (ADR-004)', () => {
  let pg: PGlite;
  let db: any;
  let persistence: EntityPersistence;
  let store: Store;

  beforeEach(async () => {
    pg = new PGlite();
    db = drizzle(pg, { schema });
    const migrationsFolder = resolveMigrationsFolder();
    await runMigrations(() => migrate(db, { migrationsFolder }), (s) => pg.exec(s), migrationsFolder);
    store = createStore();
    persistence = createPersistence(store);
    await persistence.load(db);
    await persistence.attach(db, { intervalMs: 60_000 });
  });

  afterEach(async () => {
    await persistence.detach();
    await pg.close();
  });

  /** Simula um restart: novo cache vazio carregado a partir do banco */
  async function restart(): Promise<Store> {
    const fresh = createStore();
    await createPersistence(fresh).load(db);
    return fresh;
  }

  async function countRows(collection: string): Promise<number> {
    const res = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM entity_store WHERE collection = $1', [collection]);
    return res.rows[0].n;
  }

  it('serializa e restaura Date, Map e Set aninhados', () => {
    const value = { at: new Date('2026-10-19T10:00:00Z'), tags: new Set(['a']), meta: new Map([['k', { d: new Date(0) }]]) };
    const restored = revive(JSON.parse(encode(value))) as any;
    expect(restored.at).toBeInstanceOf(Date);
    expect(restored.at.toISOString()).toBe('2026-10-19T10:00:00.000Z');
    expect(restored.tags).toEqual(new Set(['a']));
    expect(restored.meta.get('k').d).toBeInstanceOf(Date);
  });

  it('sobrevive a um restart com inserções, mutações in-place e remoções', async () => {
    store.patients.set('p1', { id: 'p1', name: { ciphertext: 'abc' }, createdAt: new Date('2026-01-01T00:00:00Z') });
    store.patients.set('p2', { id: 'p2', name: { ciphertext: 'def' }, createdAt: new Date('2026-01-02T00:00:00Z') });
    await persistence.flush();

    // Mutação in-place a partir de uma referência obtida por get()
    store.patients.get('p1').consentRevokedAt = new Date('2026-02-01T00:00:00Z');
    store.patients.delete('p2');
    await persistence.flush();

    const after = await restart();
    expect([...after.patients.keys()]).toEqual(['p1']);
    expect(after.patients.get('p1').consentRevokedAt).toBeInstanceOf(Date);
    expect(after.patients.get('p1').createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('a varredura completa captura mutações feitas por referências retidas após o flush', async () => {
    store.patients.set('p1', { id: 'p1', status: 'ACTIVE' });
    const retained = store.patients.get('p1');
    await persistence.flush();

    retained.status = 'QUARANTINED'; // sem novo acesso ao Map
    await persistence.flush();
    expect((await restart()).patients.get('p1').status).toBe('ACTIVE');

    await persistence.flush({ full: true });
    expect((await restart()).patients.get('p1').status).toBe('QUARANTINED');
  });

  it('persiste conjuntos (tokens revogados) com chaves longas', async () => {
    const jwt = 'eyJ' + 'x'.repeat(400);
    store.tokens.add(jwt);
    await persistence.flush();
    expect((await restart()).tokens.has(jwt)).toBe(true);
  });

  it('trilha append-only grava apenas novos itens e acompanha substituições do array', async () => {
    store.logs.push({ id: 'l1', timestamp: '2026-10-19T10:00:00Z', action: 'READ' });
    store.logs.push({ id: 'l2', timestamp: '2026-10-19T10:01:00Z', action: 'UPDATE' });
    await persistence.flush();
    expect(await countRows('logs')).toBe(2);

    store.logs.push({ id: 'l3', timestamp: '2026-10-19T10:02:00Z', action: 'EXPORT' });
    await persistence.flush();
    expect((await restart()).logs.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);

    // Restauração de backup substitui o array inteiro
    store.logs = [{ id: 'l9', timestamp: '2026-10-19T09:00:00Z', action: 'RESTORE' }];
    await persistence.flush();
    expect((await restart()).logs.map((l) => l.id)).toEqual(['l9']);
  });

  it('não marca mudanças como persistidas quando a transação falha e as regrava no próximo flush', async () => {
    const failingDb = Object.create(db);
    let fail = true;
    failingDb.transaction = (fn: any) => (fail ? Promise.reject(new Error('conexão perdida')) : db.transaction(fn));
    await persistence.detach();
    await persistence.load(db);
    await persistence.attach(failingDb, { intervalMs: 60_000 }).catch(() => {});

    store.patients.set('p1', { id: 'p1' });
    await expect(persistence.flush()).rejects.toThrow('conexão perdida');
    expect(await countRows('patients')).toBe(0);

    fail = false;
    await persistence.flush();
    expect(await countRows('patients')).toBe(1);
  });

  it('serializa flushes concorrentes sem perder mutações', async () => {
    const flushes: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      store.patients.set(`p${i}`, { id: `p${i}` });
      flushes.push(persistence.flush());
    }
    await Promise.all(flushes);
    expect(await countRows('patients')).toBe(20);
  });

  it('refreshMissing traz entidades gravadas por outro processo sem sobrescrever as locais', async () => {
    store.patients.set('local', { id: 'local', status: 'ORIGINAL' });
    await persistence.flush();

    // Outro processo (ex.: script de admin) grava no mesmo banco
    const other = createStore();
    const otherPersistence = createPersistence(other);
    await otherPersistence.load(db);
    await otherPersistence.attach(db, { intervalMs: 60_000 });
    other.patients.set('externo', { id: 'externo', createdAt: new Date('2026-10-19T00:00:00Z') });
    other.patients.get('local').status = 'ALTERADO_POR_OUTRO';
    await otherPersistence.flush();
    await otherPersistence.detach();

    store.patients.get('local').status = 'ALTERACAO_LOCAL_PENDENTE';
    expect(await persistence.refreshMissing('patients')).toBe(1);
    expect(store.patients.get('externo').createdAt).toBeInstanceOf(Date);
    expect(store.patients.get('local').status).toBe('ALTERACAO_LOCAL_PENDENTE');
    expect(await persistence.refreshMissing('patients')).toBe(0);
  });
});

