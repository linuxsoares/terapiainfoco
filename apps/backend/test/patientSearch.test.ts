import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { AuditAction, UserRole } from '@terapiainfoco/shared';

const PSICOLOGA_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_PATIENT_ID = '00000000-0000-0000-0000-000000000002';

async function headersFor(userId: string) {
  const { accessToken } = await authService.issueTokens(db.users.get(userId)!, '127.0.0.1');
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function search(q: string, headers: Record<string, string>) {
  return app.request(`/api/patients/search?q=${encodeURIComponent(q)}`, { headers });
}

describe('Busca de pacientes por nome ou e-mail', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('encontra por parte do nome, sem acento e sem diferenciar maiúsculas', async () => {
    const headers = await headersFor(PSICOLOGA_ID);
    await app.request('/api/patients', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'João Conceição', email: 'joao.c@exemplo.com', phone: '11999990000', consentTranscriptionSigned: false })
    });

    const res = await search('joao CONCEICAO', headers);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.patients).toHaveLength(1);
    expect(body.patients[0]).toMatchObject({ name: 'João Conceição', email: 'joao.c@exemplo.com' });

    const byFirstName = await (await search('mariana', headers)).json() as any;
    expect(byFirstName.patients.map((p: any) => p.id)).toContain(DEMO_PATIENT_ID);
  });

  it('encontra por parte do e-mail e registra a leitura na auditoria', async () => {
    const headers = await headersFor(PSICOLOGA_ID);
    const res = await search('mariana.silva@', headers);
    const body = await res.json() as any;
    expect(body.patients.map((p: any) => p.id)).toEqual([DEMO_PATIENT_ID]);
    expect(db.auditLogs.some((l) => l.resourceId === DEMO_PATIENT_ID && l.action === AuditAction.DECRYPT_READ)).toBe(true);
  });

  it('não devolve pacientes de outro consultório', async () => {
    const other = await authService.register({
      name: 'Dra. Outro Consultório',
      email: `outro.${crypto.randomUUID()}@psi.com.br`,
      password: 'SenhaPsicologo@2026',
      role: UserRole.PSICOLOGO_TITULAR,
      crp: '06/111111'
    } as any);
    const res = await search('mariana', await headersFor(other.id));
    expect(res.status).toBe(200);
    expect((await res.json() as any).patients).toEqual([]);
  });

  it('exige ao menos 2 caracteres, autenticação e perfil do consultório', async () => {
    const headers = await headersFor(PSICOLOGA_ID);
    expect((await search('m', headers)).status).toBe(400);
    expect((await app.request('/api/patients/search?q=mariana')).status).toBe(401);
  });
});
