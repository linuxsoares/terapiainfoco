import { describe, it, expect, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { authService } from '../src/services/authService';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import { UserRole } from '@terapiainfoco/shared';
import { createSimulatedWebAuthnKeyPair, createSimulatedWebAuthnAssertion } from '@terapiainfoco/crypto';
import { resetDb, listUsers } from './helpers/db';

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * Reproduz o ataque: a vítima registra uma passkey pelo fluxo do navegador (attestationObject)
 * e um atacante, sabendo só o e-mail, tenta entrar com uma asserção forjada.
 */
describe('Passkeys: asserção forjada não autentica', () => {
  beforeEach(async () => {
    await resetDb();
    db.seedDemoSession();
    await globalRateLimitStore.reset();
  });

  it('registro sem chave pública verificável é recusado e login forjado não emite tokens', async () => {
    const victim = (await listUsers()).find((u) => u.role === UserRole.PSICOLOGO_TITULAR)!;
    const { accessToken } = await authService.issueTokens(victim, '127.0.0.1');
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Vítima: payload como o do navegador, mas sem chave legível (attestationObject opaco)
    const regOptions = await (await app.request('/api/auth/passkeys/register/options', { method: 'POST', headers: auth })).json() as any;
    const credentialId = b64url('credencial-da-vitima');
    const registration = await app.request('/api/auth/passkeys/register/verify', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        credentialId,
        clientDataJSON: b64url(JSON.stringify({ type: 'webauthn.create', challenge: regOptions.challenge, origin: 'http://localhost:5174' })),
        attestationObject: b64url('nao-e-cbor')
      })
    });
    expect(registration.status).toBeGreaterThanOrEqual(400);

    // Atacante: obtém o desafio pelo e-mail e envia asserção sem assinatura válida
    const authOptions = await (await app.request('/api/auth/passkeys/auth/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: victim.email })
    })).json() as any;
    const forged = await app.request('/api/auth/passkeys/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId,
        clientDataJSON: b64url(JSON.stringify({ type: 'webauthn.get', challenge: authOptions.challenge, origin: 'http://localhost:5174' })),
        authenticatorData: b64url('dummy_authenticator_data_37_bytes_pad_len____'),
        signature: b64url('dummy_signature')
      })
    });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect(((await forged.json()) as any).accessToken).toBeUndefined();
  });

  async function registerRealPasskey() {
    const user = (await listUsers()).find((u) => u.role === UserRole.PSICOLOGO_TITULAR)!;
    const { accessToken } = await authService.issueTokens(user, '127.0.0.1');
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const options = await (await app.request('/api/auth/passkeys/register/options', { method: 'POST', headers })).json() as any;
    const key = createSimulatedWebAuthnKeyPair(options.rp.id, options.challenge, 'http://localhost:5174');
    // Mesmo formato do navegador: só clientDataJSON e attestationObject
    const res = await app.request('/api/auth/passkeys/register/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ friendlyName: 'Teste', credentialId: key.credentialId, clientDataJSON: key.clientDataJSON, attestationObject: key.attestationObject })
    });
    expect(res.status).toBe(201);
    return { user, key };
  }

  async function login(credentialId: string, assertion: { clientDataJSON: string; authenticatorData: string; signature: string }) {
    return app.request('/api/auth/passkeys/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, ...assertion })
    });
  }

  async function challengeFor(email: string) {
    return (await (await app.request('/api/auth/passkeys/auth/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })).json() as any);
  }

  it('passkey real (attestationObject) autentica; origem errada e contador repetido são recusados', async () => {
    const { user, key } = await registerRealPasskey();

    let options = await challengeFor(user.email);
    const ok = createSimulatedWebAuthnAssertion({ rpId: options.rpId, challenge: options.challenge, origin: 'http://localhost:5174', privateKey: key.privateKey, signCount: 5 });
    expect((await login(key.credentialId, ok)).status).toBe(200);

    options = await challengeFor(user.email);
    const phishing = createSimulatedWebAuthnAssertion({ rpId: options.rpId, challenge: options.challenge, origin: 'https://terapiainfoco-falso.com', privateKey: key.privateKey, signCount: 6 });
    expect((await login(key.credentialId, phishing)).status).toBeGreaterThanOrEqual(400);

    options = await challengeFor(user.email);
    const cloned = createSimulatedWebAuthnAssertion({ rpId: options.rpId, challenge: options.challenge, origin: 'http://localhost:5174', privateKey: key.privateKey, signCount: 5 });
    expect((await login(key.credentialId, cloned)).status).toBeGreaterThanOrEqual(400);
  });

  it('passkey legada sem chave pública verificável não autentica', async () => {
    const { user, key } = await registerRealPasskey();
    const stored = Array.from(db.passkeys.values()).find((p) => p.credentialId === key.credentialId)!;
    stored.publicKeyPem = `MOCK_SPKI_KEY_${key.credentialId}`;

    const options = await challengeFor(user.email);
    const assertion = createSimulatedWebAuthnAssertion({ rpId: options.rpId, challenge: options.challenge, origin: 'http://localhost:5174', privateKey: key.privateKey, signCount: 1 });
    const res = await login(key.credentialId, assertion);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(((await res.json()) as any).error ?? '').toContain('cadastre novamente');
  });
});
