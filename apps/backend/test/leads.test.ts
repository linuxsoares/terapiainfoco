import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';

const LEAD = { name: 'Dra. Ana Lima', email: 'Ana@Consultorio.com.br', crp: '06/123456', whatsapp: '11999990000', practiceType: 'clinica', consent: true };

async function postLead(body: object, ip = '10.0.0.1') {
  return app.request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  });
}

async function tokenFor(role: UserRole) {
  const user = Array.from(db.users.values()).find((u) => u.role === role)!;
  return (await authService.issueTokens(user, '127.0.0.1')).accessToken!;
}

describe('Pedidos de acesso da landing page', () => {
  beforeEach(() => {
    db.clear();
    db.seedDemoSession();
    globalRateLimitStore.reset();
  });

  it('grava o pedido com contato cifrado e o Admin o lê decifrado', async () => {
    expect((await postLead(LEAD)).status).toBe(201);
    const stored = Array.from(db.leads.values())[0];
    expect(JSON.stringify(stored)).not.toContain('consultorio.com.br');

    const res = await app.request('/api/leads', { headers: { Authorization: `Bearer ${await tokenFor(UserRole.ADMIN)}` } });
    const body = await res.json() as any;
    expect(body.leads[0]).toMatchObject({ name: 'Dra. Ana Lima', email: 'ana@consultorio.com.br', whatsapp: '11999990000', practiceType: 'clinica' });
  });

  it('exige consentimento explícito e dados válidos; honeypot não grava', async () => {
    expect((await postLead({ ...LEAD, consent: false })).status).toBe(400);
    expect((await postLead({ ...LEAD, email: 'invalido' })).status).toBe(400);
    expect((await postLead({ ...LEAD, crp: '' })).status).toBe(400);
    expect((await postLead({ ...LEAD, website: 'http://spam' })).status).toBe(201);
    expect(db.leads.size).toBe(0);
  });

  it('limita pedidos por IP e restringe a leitura ao Admin', async () => {
    for (let i = 0; i < 5; i++) expect((await postLead(LEAD, '10.0.0.9')).status).toBe(201);
    expect((await postLead(LEAD, '10.0.0.9')).status).toBe(429);

    expect((await app.request('/api/leads')).status).toBe(401);
    const psychologist = await tokenFor(UserRole.PSICOLOGO_TITULAR);
    expect((await app.request('/api/leads', { headers: { Authorization: `Bearer ${psychologist}` } })).status).toBe(403);
  });
});
