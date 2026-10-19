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
        name: 'Paciente Persistência',
        email: 'persistencia.e2e@paciente.com.br',
        password: 'SenhaPaciente@2026',
        role: UserRole.PACIENTE,
        phone: '(11) 90000-0000',
        cpf: '111.222.333-44'
      })
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    const userId = body.user.id;
    const patientId = body.user.patientId;

    const db: any = await getDb();
    const rows = await db.execute(sql`SELECT collection, id FROM entity_store WHERE id IN (${userId}, ${patientId})`);
    const found = (rows.rows ?? rows).map((r: any) => r.collection).sort();
    expect(found).toEqual(['patients', 'users']);
  });
});
