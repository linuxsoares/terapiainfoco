import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

export type AppDb = ReturnType<typeof drizzlePostgres<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

let _dbInstance: AppDb | null = null;
let _pgliteInstance: PGlite | null = null;

export async function getDb(): Promise<AppDb> {
  if (_dbInstance) {
    return _dbInstance;
  }

  if (databaseUrl) {
    console.log(`🔌 Conectando ao PostgreSQL via DATABASE_URL...`);
    const client = postgres(databaseUrl, { max: 10 });
    _dbInstance = drizzlePostgres(client, { schema });
    return _dbInstance;
  }

  // Fallback transparente para PostgreSQL embutido (PGlite) para execução local e testes imediatos
  if (!_pgliteInstance) {
    _pgliteInstance = new PGlite();
    _dbInstance = drizzlePglite(_pgliteInstance, { schema });

    // Executa migrações no banco local embutido
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    try {
      await migratePglite(_dbInstance as any, { migrationsFolder });
    } catch {
      // Migrações já aplicadas ou rodando em memória
    }

    // Seed inicial de terapeuta para desenvolvimento
    await (_dbInstance as any)
      .insert(schema.therapists)
      .values({
        id: '00000000-0000-0000-0000-000000000001',
        crp: '06/142980',
        crpRegion: 'SP',
        status: 'ACTIVE',
        encryptedDek: 'mock-encrypted-dek-base64'
      })
      .onConflictDoNothing();
  }

  return _dbInstance;
}

export { schema };
