import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { toPrefixTsQuery } from '../src/repositories/therapistProfileRepository';
import { UserRole } from '@terapiainfoco/shared';

const ADMIN_ID = '00000000-0000-0000-0000-000000000004';

async function tokenFor(userId: string): Promise<string> {
  const { accessToken } = await authService.issueTokens(db.users.get(userId)!, '127.0.0.1');
  return accessToken;
}

async function search(query: string): Promise<any> {
  const res = await app.request(`/api/therapists/search?${query}`);
  expect(res.status).toBe(200);
  return res.json();
}

/** Psicólogo novo com nome único (a tabela SQL é compartilhada entre os testes do processo) */
async function newPsychologist() {
  const marker = `Zuleica${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const user = await authService.register({
    name: `Dra. ${marker} Andrade`,
    email: `${marker.toLowerCase()}@psi.com.br`,
    password: 'SenhaPsicologo@2026',
    role: UserRole.PSICOLOGO_TITULAR,
    crp: '06/123456',
    crpRegion: 'SP'
  } as any);
  const headers = { Authorization: `Bearer ${await tokenFor(user.id)}`, 'Content-Type': 'application/json' };
  return { user, marker, headers };
}

function putProfile(headers: Record<string, string>, body: unknown) {
  return app.request('/api/therapists/me/profile', { method: 'PUT', headers, body: JSON.stringify(body) });
}

describe('Busca de psicólogos (perfis públicos)', () => {
  beforeEach(() => {
    globalRateLimitStore.reset();
  });

  it('monta consulta por prefixo normalizada e descarta caracteres de controle do tsquery', () => {
    expect(toPrefixTsQuery('Ansiedade e Pânico')).toBe('ansiedade:* & pânico:*'.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    expect(toPrefixTsQuery("'; DROP TABLE x; -- | ! &")).toBe('drop:* & table:*');
    expect(toPrefixTsQuery('a')).toBeNull();
  });

  it('encontra a psicóloga demo por texto (com ou sem acento, por prefixo) e por filtros', async () => {
    for (const q of ['ansiedade', 'panico', 'pânico', 'ansied', 'beatriz tcc']) {
      const data = await search(`q=${encodeURIComponent(q)}`);
      expect({ q, slugs: data.results.map((r: any) => r.slug) }).toEqual({ q, slugs: expect.arrayContaining(['beatriz-santos']) });
    }
    const byApproach = await search(`approach=${encodeURIComponent('Terapia de Aceitação e Compromisso (ACT)')}`);
    expect(byApproach.results.map((r: any) => r.slug)).toContain('beatriz-santos');
    const bySpecialty = await search(`specialty=${encodeURIComponent('Luto')}`);
    expect(bySpecialty.results.map((r: any) => r.slug)).not.toContain('beatriz-santos');
    const cheap = await search('maxFeeCents=20000');
    expect(cheap.results.map((r: any) => r.slug)).not.toContain('beatriz-santos');
    // Operadores de tsquery no texto livre não quebram a consulta
    const operators = await search(`q=${encodeURIComponent('tcc & | ! : ansiedade')}`);
    expect(operators.results.map((r: any) => r.slug)).toContain('beatriz-santos');
    // Padrões de injeção SQL são barrados pelo WAF antes da rota
    const injection = await app.request(`/api/therapists/search?q=${encodeURIComponent("'; drop table therapist_profiles; --")}`);
    expect(injection.status).toBe(403);
  });

  it('perfil público por slug não expõe dados internos', async () => {
    const res = await app.request('/api/therapists/beatriz-santos');
    expect(res.status).toBe(200);
    const { profile } = await res.json() as any;
    expect(profile.displayName).toBe('Dra. Beatriz Santos');
    expect(profile.userId).toBeUndefined();
    expect(profile.searchText).toBeUndefined();
    expect((await app.request('/api/therapists/nao-existe')).status).toBe(404);
  });

  it('perfil só entra na busca depois de publicado pelo psicólogo e com CRP verificado pelo Admin', async () => {
    const { marker, headers, user } = await newPsychologist();
    const created = await putProfile(headers, {
      headline: 'Luto e relacionamentos',
      approaches: ['Psicanálise'],
      specialties: ['Luto'],
      sessionFeeCents: 18000,
      published: true
    });
    expect(created.status).toBe(200);
    const { profile } = await created.json() as any;
    expect(profile.crpVerified).toBe(false);
    expect(profile.published).toBe(true);
    expect((await search(`q=${marker}`)).total).toBe(0);
    expect((await app.request(`/api/therapists/${profile.slug}`)).status).toBe(404);

    const adminHeaders = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}`, 'Content-Type': 'application/json' };
    const pending = await (await app.request('/api/therapists/admin/pending', { headers: adminHeaders })).json() as any;
    expect(pending.profiles.map((p: any) => p.therapistId)).toContain(user.therapistId);

    const verify = await app.request(`/api/therapists/admin/${user.therapistId}/verify-crp`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ approved: true })
    });
    expect(verify.status).toBe(200);
    const found = await search(`q=${marker}&specialty=Luto&maxFeeCents=20000`);
    expect(found.results.map((r: any) => r.therapistId)).toEqual([user.therapistId]);

    // Reprovação retira da busca e despublica
    await app.request(`/api/therapists/admin/${user.therapistId}/verify-crp`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ approved: false })
    });
    expect((await search(`q=${marker}`)).total).toBe(0);
    const own = await (await app.request('/api/therapists/me/profile', { headers })).json() as any;
    expect(own.profile.published).toBe(false);
    const queue = await (await app.request('/api/therapists/admin/pending', { headers: adminHeaders })).json() as any;
    expect(queue.profiles.map((p: any) => p.therapistId)).not.toContain(user.therapistId);
  });

  it('valida catálogos e limites do perfil', async () => {
    const { headers } = await newPsychologist();
    expect((await putProfile(headers, { approaches: ['Astrologia'] })).status).toBe(400);
    expect((await putProfile(headers, { sessionFeeCents: -10 })).status).toBe(400);
    expect((await putProfile(headers, { bio: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('somente psicólogo edita perfil e somente Admin verifica CRP', async () => {
    const adminHeaders = { Authorization: `Bearer ${await tokenFor(ADMIN_ID)}`, 'Content-Type': 'application/json' };
    expect((await putProfile(adminHeaders, { headline: 'x' })).status).toBe(403);
    expect((await putProfile({ 'Content-Type': 'application/json' }, { headline: 'x' })).status).toBe(401);

    const { headers } = await newPsychologist();
    const selfVerify = await app.request('/api/therapists/admin/therapist-001/verify-crp', {
      method: 'POST', headers, body: JSON.stringify({ approved: true })
    });
    expect(selfVerify.status).toBe(403);
    expect((await app.request('/api/therapists/admin/pending', { headers })).status).toBe(403);
  });
});
