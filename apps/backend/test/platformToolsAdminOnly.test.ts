import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { adminRequest } from './helpers/adminRequest';

/** Psicóloga titular do seed */
const SEED_THERAPIST_ID = '00000000-0000-0000-0000-000000000001';

// Ferramentas da plataforma do painel de Segurança: antes abertas a qualquer requisição
const PLATFORM_TOOL_PREFIXES = [
  'advanced-rate-limiter', 'anti-automation', 'anti-replay', 'blind-signatures', 'brute-force-pow',
  'cache-guard', 'court-order-threshold', 'device-posture', 'did', 'differential-privacy',
  'ephemeral-tokens', 'expression-guard', 'graphql-guard', 'homomorphic', 'http-guard',
  'http2-guard', 'os-command-guard', 'path-traversal-guard', 'pqc-hybrid', 'prototype-pollution',
  'redos-guard', 'secure-memory', 'session-binding', 'session-guard', 'side-channel',
  'ssrf-guard', 'ssti-guard', 'supply-chain-guard', 'tls-pinning', 'tsa-notary',
  'ueba', 'websocket-guard', 'xml-guard'
];

describe('Ferramentas da plataforma restritas ao Admin', () => {
  it.each(PLATFORM_TOOL_PREFIXES)('/api/%s exige autenticação e perfil Admin', async (prefix) => {
    const anonymous = await app.request(`/api/${prefix}/overview`);
    expect(anonymous.status).toBe(401);

    const { accessToken } = await authService.issueTokens(db.users.get(SEED_THERAPIST_ID)!, '127.0.0.1');
    const therapist = await app.request(`/api/${prefix}/overview`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(therapist.status).toBe(403);

    const admin = await adminRequest(`/api/${prefix}/overview`);
    expect([401, 403]).not.toContain(admin.status);
  });
});
