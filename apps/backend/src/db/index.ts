import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import fs from 'node:fs';

const databaseUrl = process.env.DATABASE_URL;

export type AppDb = ReturnType<typeof drizzlePostgres<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

let _dbInstance: AppDb | null = null;
let _pgliteInstance: PGlite | null = null;

export async function getDb(): Promise<AppDb> {
  if (_dbInstance) {
    return _dbInstance;
  }

  if (databaseUrl) {
    const isSupabase = databaseUrl.includes('supabase.co') || databaseUrl.includes('pooler.supabase.com');
    console.log(`🔌 Conectando ao PostgreSQL via DATABASE_URL${isSupabase ? ' (Supabase detectado)' : ''}...`);
    const ssl = isSupabase || databaseUrl.includes('sslmode=require') ? 'require' : undefined;
    const client = postgres(databaseUrl, {
      max: 10,
      ssl,
      prepare: isSupabase ? false : undefined
    });
    _dbInstance = drizzlePostgres(client, { schema });

    const possibleFolders = [
      path.resolve(import.meta.dir || __dirname, '../../drizzle'),
      path.resolve(process.cwd(), 'apps/backend/drizzle'),
      path.resolve(process.cwd(), 'drizzle')
    ];
    const migrationsFolder = possibleFolders.find(f => fs.existsSync(f)) || possibleFolders[0];

    try {
      await migratePostgres(_dbInstance as any, { migrationsFolder });
      console.log('✅ Migrações aplicadas com sucesso no PostgreSQL via Drizzle.');
    } catch (err) {
      console.warn('⚠️ Drizzle migrator reportou:', (err as Error).message);
      console.log('🔄 Executando sincronização direta de schema SQL no Supabase...');
      try {
        const sqlFile = path.resolve(migrationsFolder, '0000_late_starfox.sql');
        if (fs.existsSync(sqlFile)) {
          const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
          const statements = sqlContent.split('--> statement-breakpoint');
          for (const stmt of statements) {
            const clean = stmt.trim();
            if (clean) {
              await client.unsafe(clean);
            }
          }
          console.log('✅ Schema e tabelas sincronizados diretamente via SQL.');
        }
      } catch (sqlErr) {
        console.warn('⚠️ Nota sobre execução SQL direta (tabelas já existentes):', (sqlErr as Error).message);
      }
    }

    try {
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
    } catch {
      // Ignora se já existir ou erro transitório
    }

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
