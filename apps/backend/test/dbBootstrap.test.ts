import { describe, it, expect } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { runMigrations, resolveMigrationsFolder } from '../src/db';

const migrationsFolder = resolveMigrationsFolder();

const migrationFiles = fs.readdirSync(migrationsFolder).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();

function migrationStatements(): string[] {
  return migrationFiles
    .flatMap(f => fs.readFileSync(path.join(migrationsFolder, f), 'utf-8').split('--> statement-breakpoint'))
    .map(s => s.trim())
    .filter(Boolean);
}

async function journalCount(pg: PGlite): Promise<number> {
  const res = await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations');
  return res.rows[0].count;
}

describe('Bootstrap do banco de dados', () => {
  it('aplica migrações em banco vazio e é idempotente', async () => {
    const pg = new PGlite();
    const db = drizzle(pg);
    const run = () => runMigrations(() => migrate(db, { migrationsFolder }), (s) => pg.exec(s), migrationsFolder);

    await run();
    const applied = await journalCount(pg);
    expect(applied).toBeGreaterThan(0);

    await run();
    expect(await journalCount(pg)).toBe(applied);
    await pg.close();
  });

  it('registra baseline quando o schema já existe sem journal Drizzle (db:push / SQL manual)', async () => {
    const pg = new PGlite();
    for (const statement of migrationStatements()) {
      await pg.exec(statement);
    }
    const db = drizzle(pg);
    const run = () => runMigrations(() => migrate(db, { migrationsFolder }), (s) => pg.exec(s), migrationsFolder);

    await run();
    const applied = await journalCount(pg);
    expect(applied).toBe(migrationFiles.length);

    // Na execução seguinte o migrator oficial encontra o journal e não reaplica nada
    await run();
    expect(await journalCount(pg)).toBe(applied);
    await pg.close();
  });

  it('registra baseline via driver postgres-js (protocolo de rede, como no Railway)', async () => {
    const pg = new PGlite();
    for (const statement of migrationStatements()) {
      await pg.exec(statement);
    }
    const port = 54000 + Math.floor(Math.random() * 1000);
    const server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1' });
    await server.start();
    const client = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
    try {
      const db = drizzlePostgres(client);
      const run = () => runMigrations(() => migratePostgres(db, { migrationsFolder }), (s) => client.unsafe(s), migrationsFolder);
      await run();
      await run();
      const rows = await client`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
      expect(rows[0].count).toBe(migrationFiles.length);
    } finally {
      await client.end();
      await server.stop();
      await pg.close();
    }
  });

  it('migra schema legado do supabase_full_schema.sql (FKs inline nomeadas *_fkey)', async () => {
    const pg = new PGlite();
    const legacy = fs.readFileSync(path.join(migrationsFolder, 'supabase_full_schema.sql'), 'utf-8')
      .replace(/CREATE EXTENSION[^;]*;/g, '');
    await pg.exec(legacy);
    const db = drizzle(pg);
    const run = () => runMigrations(() => migrate(db, { migrationsFolder }), (s) => pg.exec(s), migrationsFolder);

    await run();
    expect(await journalCount(pg)).toBe(migrationFiles.length);
    const type = await pg.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'patient_id'`
    );
    expect(type.rows[0].data_type).toBe('text');
    await pg.close();
  });

  it('propaga erros de migração que não sejam de objeto já existente', async () => {
    const failing = () => Promise.reject(new Error('permission denied for schema public'));
    await expect(runMigrations(failing, async () => [], migrationsFolder)).rejects.toThrow('permission denied');
  });

  it('recusa iniciar em produção sem DATABASE_URL', () => {
    const dbModule = path.resolve(import.meta.dir, '../src/db/index.ts');
    const proc = Bun.spawnSync(['bun', '-e', `const { getDb } = await import(${JSON.stringify(dbModule)}); await getDb();`], {
      env: {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'production',
        JWT_SECRET: 'x',
        BLIND_INDEX_SALT: 'y',
        FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        KMS_MASTER_KEY: Buffer.alloc(32, 2).toString('base64'),
        PUBLIC_APP_URL: 'https://app.terapiainfoco.com.br'
      }
    });
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain('DATABASE_URL não configurada em produção');
  });
});
