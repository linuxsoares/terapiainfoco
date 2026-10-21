import { describe, it, expect } from 'bun:test';
import { sql } from 'drizzle-orm';
import { app } from '../src/index';
import { getDb } from '../src/db';
import { persistence } from '../src/db/memoryDb';
import { UserRole } from '@terapiainfoco/shared';

describe('Gravação durável ao final da requisição (ADR-004)', () => {
  it('cadastro via API já está no PostgreSQL quando a resposta é enviada', async () => {
    expect(persistence.enabled).toBe(true);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.77.1' },
      body: JSON.stringify({
        name: 'Dra. Persistência',
        email: 'persistencia.e2e@psi.com.br',
        password: 'SenhaPsicologo@2026',
        role: UserRole.PSICOLOGO_TITULAR,
        crp: '06/555555'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    const userId = body.user.id;
    const therapistId = body.user.therapistId;

    const db: any = await getDb();
    // A conta vai para a tabela users (repositório SQL); o consultório segue no entity_store
    const stored = await db.execute(sql`SELECT collection, id FROM entity_store WHERE id IN (${userId}, ${therapistId})`);
    expect((stored.rows ?? stored).map((r: any) => r.collection)).toEqual(['therapists']);
    const account = await db.execute(sql`SELECT id FROM users WHERE id = ${userId}`);
    expect((account.rows ?? account).length).toBe(1);
  });
});
