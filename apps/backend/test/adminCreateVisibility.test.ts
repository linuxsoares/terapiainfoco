import { describe, it, expect } from 'bun:test';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { app } from '../src/index';
import { getDb } from '../src/db';
import { encode } from '../src/db/persistence';
import { UserRole } from '@terapiainfoco/shared';

describe('Conta criada fora do servidor (bun run admin:create)', () => {
  it('login encontra usuário gravado no banco por outro processo após o boot', async () => {
    const email = `dpo.${crypto.randomUUID().slice(0, 8)}@clinica.com.br`;
    const user = {
      id: crypto.randomUUID(),
      email,
      name: 'DPO Externo',
      role: UserRole.ADMIN,
      passwordHash: await Bun.password.hash('SenhaAdminForte@2026'),
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    const db: any = await getDb();
    await db.execute(sql`INSERT INTO entity_store (collection, id, data) VALUES ('users', ${user.id}, ${encode(user)}::jsonb)`);

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.99.1' },
      body: JSON.stringify({ email, password: 'SenhaAdminForte@2026' })
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).user.role).toBe(UserRole.ADMIN);
  });

  it('admin:create recusa banco temporário em vez de fingir sucesso', () => {
    const script = path.resolve(import.meta.dir, '../src/scripts/createAdmin.ts');
    const proc = Bun.spawnSync(['bun', script, 'dpo@clinica.com.br', 'DPO'], {
      env: { PATH: process.env.PATH ?? '', ADMIN_PASSWORD: 'SenhaAdminForte@2026' }
    });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain('Sem DATABASE_URL');
  });
});
