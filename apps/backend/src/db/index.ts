import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import path from 'node:path';
import fs from 'node:fs';
import { seedAndSyncDatabase } from './sync';
import { config } from '../config';


export type AppDb = ReturnType<typeof drizzlePostgres<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

/** Executa SQL bruto (múltiplos comandos) no driver subjacente */
type RawExecutor = (statement: string) => Promise<unknown>;

let _initPromise: Promise<AppDb> | null = null;

/**
 * Retorna a conexão única com o banco, inicializando-a (conexão, migrações e seed) na primeira chamada.
 * Chamadas concorrentes compartilham a mesma inicialização.
 */
export function getDb(): Promise<AppDb> {
  if (!_initPromise) {
    _initPromise = initDatabase().catch((err) => {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

async function initDatabase(): Promise<AppDb> {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL;

  const migrationsFolder = resolveMigrationsFolder();
  let db: AppDb;

  if (databaseUrl) {
    const isSupabase = databaseUrl.includes('supabase.co') || databaseUrl.includes('pooler.supabase.com');
    const sanitizedUrl = databaseUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`🔌 Conectando ao PostgreSQL via DATABASE_URL (${sanitizedUrl})...`);
    const ssl = isSupabase || databaseUrl.includes('sslmode=require') ? 'require' : undefined;
    const client = postgres(databaseUrl, {
      max: 10,
      ssl,
      // Pooler transacional do Supabase não suporta prepared statements
      prepare: isSupabase ? false : undefined,
      // NOTICEs de "IF NOT EXISTS" a cada boot são ruído no log
      onnotice: () => {}
    });
    db = drizzlePostgres(client, { schema });
    await runMigrations(
      () => migratePostgres(db as any, { migrationsFolder }),
      (statement) => client.unsafe(statement),
      migrationsFolder
    );
  } else {
    if (config.isProduction && !config.allowEphemeralDatabase) {
      throw new Error(
        'DATABASE_URL não configurada em produção. Defina DATABASE_URL (ex: ${{Postgres.DATABASE_URL}} no Railway) ' +
        'ou, apenas para ambientes de demonstração descartáveis, ALLOW_EPHEMERAL_DATABASE=true.'
      );
    }
    if (config.pgliteDataDir) {
      console.log(`💾 PGlite persistente em ${config.pgliteDataDir}`);
    } else if (config.isProduction) {
      console.warn('⚠️ ALLOW_EPHEMERAL_DATABASE=true: dados serão PERDIDOS a cada restart.');
    }
    const pglite = config.pgliteDataDir ? new PGlite(config.pgliteDataDir) : new PGlite();
    db = drizzlePglite(pglite, { schema });
    await runMigrations(
      () => migratePglite(db as any, { migrationsFolder }),
      (statement) => pglite.exec(statement),
      migrationsFolder
    );
  }

  await seedAndSyncDatabase(db);
  return db;
}

/**
 * Aplica as migrações Drizzle. Se o schema já existir sem registro no journal do Drizzle
 * (criado via `drizzle-kit push` ou SQL manual), aplica as migrações pendentes de forma idempotente,
 * tolerando somente erros de "objeto já existe", e registra o baseline para as próximas execuções.
 * Qualquer outro erro interrompe a inicialização.
 */
export async function runMigrations(migrate: () => Promise<void>, exec: RawExecutor, migrationsFolder: string): Promise<void> {
  if (!fs.existsSync(path.join(migrationsFolder, 'meta/_journal.json'))) {
    throw new Error(`Pasta de migrações Drizzle não encontrada: ${migrationsFolder}`);
  }

  try {
    await migrate();
    console.log('✅ Migrações Drizzle aplicadas.');
    return;
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;
    console.warn('⚠️ Schema pré-existente sem journal Drizzle detectado; registrando baseline das migrações.');
  }

  await exec('CREATE SCHEMA IF NOT EXISTS drizzle');
  await exec('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  const recorded = await exec('SELECT hash FROM drizzle.__drizzle_migrations');
  const recordedHashes = new Set(extractRows(recorded).map((row: any) => row.hash));

  for (const migration of readMigrationFiles({ migrationsFolder })) {
    if (recordedHashes.has(migration.hash)) continue;
    for (const statement of migration.sql) {
      const clean = statement.trim();
      if (!clean) continue;
      try {
        await exec(clean);
      } catch (err) {
        if (!isAlreadyExistsError(err) && !isSupersededForeignKey(clean, err)) throw err;
      }
    }
    await exec(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${migration.hash}', ${migration.folderMillis})`
    );
  }
  console.log('✅ Baseline de migrações registrado.');
}

/** Códigos SQLSTATE de objetos duplicados: tabela, objeto, coluna, schema, tipo/índice duplicados */
const ALREADY_EXISTS_CODES = new Set(['42P07', '42710', '42701', '42P06', '42P16']);

function isAlreadyExistsError(err: unknown): boolean {
  let current: any = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (ALREADY_EXISTS_CODES.has(current.code) || /already exists/i.test(current.message ?? '')) return true;
    current = current.cause;
  }
  return false;
}

/**
 * No baseline, migrações antigas são reaplicadas sobre o schema atual. Uma FK criada no passado
 * pode não caber mais numa coluna cujo tipo uma migração posterior alterou (ex.: users.therapist_id
 * uuid → text na 0004, que também remove essa FK): o erro de tipo (42804) é tolerado só nesse caso.
 */
function isSupersededForeignKey(statement: string, err: unknown): boolean {
  let current: any = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === '42804' || /foreign key constraint .* cannot be implemented/i.test(current.message ?? '')) {
      return /ADD CONSTRAINT [\s\S]*FOREIGN KEY/i.test(statement);
    }
    current = current.cause;
  }
  return false;
}

/** Normaliza o retorno de `client.unsafe` (array de linhas) e `pglite.exec` (array de resultados) */
function extractRows(result: unknown): any[] {
  if (!Array.isArray(result)) return [];
  const last = result[result.length - 1];
  return last && Array.isArray(last.rows) ? last.rows : result;
}

export function resolveMigrationsFolder(): string {
  const possibleFolders = [
    path.resolve(import.meta.dir || __dirname, '../../drizzle'),
    path.resolve(process.cwd(), 'apps/backend/drizzle'),
    path.resolve(process.cwd(), 'drizzle')
  ];
  return possibleFolders.find(f => fs.existsSync(f)) || possibleFolders[0];
}

export { schema };
