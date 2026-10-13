import { describe, expect, it, beforeEach } from 'bun:test';
import { app } from '../src';
import { db } from '../src/db/memoryDb';
import { globalRateLimitStore } from '../src/middlewares/rateLimiter';
import {
  createSimulatedWebAuthnKeyPair,
  createSimulatedWebAuthnAssertion
} from '@terapiainfoco/crypto';
import type { 
  PasskeyRegistrationOptionsResponse, 
  PasskeyAuthenticationOptionsResponse,
  PasskeyListResponse,
  LoginResponse
} from '@terapiainfoco/shared';

describe('Autenticação Biométrica WebAuthn / Passkeys (FIDO2 / TouchID / FaceID - RFC-001 Opção O)', () => {
  let therapistToken: string;
  let therapistUser: any;
  let adminToken: string;

  beforeEach(async () => {
    db.clear();
    globalRateLimitStore.reset();

    // 1. Login Psicólogo Titular
    const loginTherapist = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'psicologo@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    const therapistData = await loginTherapist.json();
    therapistToken = therapistData.accessToken;
    therapistUser = therapistData.user;

    // 2. Login Admin
    const loginAdmin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@terapiainfoco.com.br',
        password: 'Senha@123456'
      })
    });
    adminToken = (await loginAdmin.json()).accessToken;
  });

  describe('Fluxo de Registro de Passkey (Registration / Attestation)', () => {
    it('deve rejeitar solicitação de opções de registro sem autenticação (401 Unauthorized)', async () => {
      const res = await app.request('/api/auth/passkeys/register/options', {
        method: 'POST'
      });
      expect(res.status).toBe(401);
    });

    it('deve gerar opções de registro WebAuthn válidas com desafio aleatório e algoritmo ES256', async () => {
      const res = await app.request('/api/auth/passkeys/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });

      expect(res.status).toBe(200);
      const data: PasskeyRegistrationOptionsResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.challenge).toBeDefined();
      expect(data.rp.name).toContain('TerapiaInFoco');
      expect(data.user.id).toBe(therapistUser.id);
      expect(data.user.name).toBe('psicologo@terapiainfoco.com.br');
      expect(data.pubKeyCredParams.some(p => p.alg === -7)).toBe(true); // ES256
      expect(data.authenticatorSelection.authenticatorAttachment).toBe('platform');
    });

    it('deve registrar com sucesso uma Passkey biométrica vinculada ao usuário', async () => {
      // 1. Solicita desafio
      const optRes = await app.request('/api/auth/passkeys/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });
      const options: PasskeyRegistrationOptionsResponse = await optRes.json();

      // 2. Simula criação de par de chaves TouchID/FaceID no cliente
      const simulated = createSimulatedWebAuthnKeyPair(
        options.rp.id,
        options.challenge,
        'http://localhost:5174'
      );

      // 3. Envia verificação de registro para o backend
      const verifyRes = await app.request('/api/auth/passkeys/register/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          friendlyName: 'MacBook Air TouchID (Clínica)',
          clientDataJSON: simulated.clientDataJSON,
          authenticatorData: simulated.authenticatorData,
          credentialId: simulated.credentialId,
          publicKeyPem: simulated.publicKeyPem
        })
      });

      expect(verifyRes.status).toBe(201);
      const verifyData = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.passkey).toBeDefined();
      expect(verifyData.passkey.friendlyName).toBe('MacBook Air TouchID (Clínica)');
      expect(verifyData.passkey.credentialId).toBe(simulated.credentialId);

      // 4. Valida persistência no banco e auditoria WORM
      expect(db.passkeys.size).toBe(1);
      const stored = Array.from(db.passkeys.values())[0];
      expect(stored.userId).toBe(therapistUser.id);
      expect(stored.credentialId).toBe(simulated.credentialId);

      const auditEvent = db.auditLogs.find(l => l.resourceId === stored.id);
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.action).toBe('PASSKEY_REGISTER');
    });

    it('deve rejeitar registro se o desafio WebAuthn for incorreto ou manipulado', async () => {
      await app.request('/api/auth/passkeys/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });

      // Cria credencial com desafio falso
      const fakeSimulated = createSimulatedWebAuthnKeyPair(
        'localhost',
        'desafio-falso-manipulado',
        'http://localhost:5174'
      );

      const res = await app.request('/api/auth/passkeys/register/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          friendlyName: 'Chave Falsa',
          clientDataJSON: fakeSimulated.clientDataJSON,
          authenticatorData: fakeSimulated.authenticatorData,
          credentialId: fakeSimulated.credentialId
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Desafio WebAuthn inválido');
    });
  });

  describe('Fluxo de Autenticação Passwordless (Authentication / Assertion)', () => {
    let registeredPasskey: any;

    beforeEach(async () => {
      // Pré-cadastra uma Passkey para o psicólogo titular
      const optRes = await app.request('/api/auth/passkeys/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });
      const options = await optRes.json();

      registeredPasskey = createSimulatedWebAuthnKeyPair(
        options.rp.id,
        options.challenge,
        'http://localhost:5174'
      );

      await app.request('/api/auth/passkeys/register/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          friendlyName: 'iPhone 15 Pro FaceID',
          clientDataJSON: registeredPasskey.clientDataJSON,
          authenticatorData: registeredPasskey.authenticatorData,
          credentialId: registeredPasskey.credentialId,
          publicKeyPem: registeredPasskey.publicKeyPem
        })
      });
    });

    it('deve gerar opções de desafio de autenticação com lista de credenciais permitidas', async () => {
      const res = await app.request('/api/auth/passkeys/auth/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'psicologo@terapiainfoco.com.br' })
      });

      expect(res.status).toBe(200);
      const data: PasskeyAuthenticationOptionsResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.challenge).toBeDefined();
      expect(data.allowCredentials).toBeDefined();
      expect(data.allowCredentials?.some(c => c.id === registeredPasskey.credentialId)).toBe(true);
    });

    it('deve realizar login passwordless biométrico com sucesso e emitir tokens JWT válidos', async () => {
      // 1. Obtém desafio de login
      const optRes = await app.request('/api/auth/passkeys/auth/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'psicologo@terapiainfoco.com.br' })
      });
      const authOptions: PasskeyAuthenticationOptionsResponse = await optRes.json();

      // 2. Simula assinatura da asserção biométrica (TouchID/FaceID) com a chave privada
      const assertion = createSimulatedWebAuthnAssertion({
        rpId: authOptions.rpId,
        challenge: authOptions.challenge,
        origin: 'http://localhost:5174',
        privateKey: registeredPasskey.privateKey,
        signCount: 1
      });

      // 3. Envia verificação de login
      const loginRes = await app.request('/api/auth/passkeys/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId: registeredPasskey.credentialId,
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature
        })
      });

      expect(loginRes.status).toBe(200);
      const loginData: LoginResponse = await loginRes.json();
      expect(loginData.success).toBe(true);
      expect(loginData.accessToken).toBeDefined();
      expect(loginData.refreshToken).toBeDefined();
      expect(loginData.user.email).toBe('psicologo@terapiainfoco.com.br');
      expect(loginData.user.role).toBe('PSICOLOGO_TITULAR');

      // 4. Valida se o token emitido autentica endpoints protegidos
      const meRes = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${loginData.accessToken}` }
      });
      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.user.id).toBe(therapistUser.id);
    });

    it('deve rejeitar login com assinatura adulterada ou chave privada incorreta', async () => {
      const optRes = await app.request('/api/auth/passkeys/auth/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'psicologo@terapiainfoco.com.br' })
      });
      const authOptions = await optRes.json();

      // Gera outra chave não autorizada (atacante)
      const impostorKey = createSimulatedWebAuthnKeyPair(
        authOptions.rpId,
        authOptions.challenge,
        'http://localhost:5174'
      );

      const fakeAssertion = createSimulatedWebAuthnAssertion({
        rpId: authOptions.rpId,
        challenge: authOptions.challenge,
        origin: 'http://localhost:5174',
        privateKey: impostorKey.privateKey,
        signCount: 1
      });

      const res = await app.request('/api/auth/passkeys/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId: registeredPasskey.credentialId, // Id da vítima
          clientDataJSON: fakeAssertion.clientDataJSON,
          authenticatorData: fakeAssertion.authenticatorData,
          signature: fakeAssertion.signature // Assinatura do impostor
        })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Assinatura biométrica Passkey inválida');
    });

    it('deve rejeitar credencial inexistente ou não registrada', async () => {
      const optRes = await app.request('/api/auth/passkeys/auth/options', {
        method: 'POST'
      });
      const authOptions = await optRes.json();

      const unregistered = createSimulatedWebAuthnKeyPair(
        authOptions.rpId,
        authOptions.challenge,
        'http://localhost:5174'
      );

      const assertion = createSimulatedWebAuthnAssertion({
        rpId: authOptions.rpId,
        challenge: authOptions.challenge,
        origin: 'http://localhost:5174',
        privateKey: unregistered.privateKey
      });

      const res = await app.request('/api/auth/passkeys/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId: unregistered.credentialId,
          clientDataJSON: assertion.clientDataJSON,
          authenticatorData: assertion.authenticatorData,
          signature: assertion.signature
        })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('não encontrada');
    });
  });

  describe('Gestão e Revogação de Passkeys (Passkey Management)', () => {
    let createdPasskeyId: string;

    beforeEach(async () => {
      const optRes = await app.request('/api/auth/passkeys/register/options', {
        method: 'POST',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });
      const options = await optRes.json();

      const simulated = createSimulatedWebAuthnKeyPair(
        options.rp.id,
        options.challenge,
        'http://localhost:5174'
      );

      const regRes = await app.request('/api/auth/passkeys/register/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${therapistToken}`
        },
        body: JSON.stringify({
          friendlyName: 'YubiKey 5C NFC',
          clientDataJSON: simulated.clientDataJSON,
          authenticatorData: simulated.authenticatorData,
          credentialId: simulated.credentialId,
          publicKeyPem: simulated.publicKeyPem
        })
      });

      const data = await regRes.json();
      createdPasskeyId = data.passkey.id;
    });

    it('deve listar todas as Passkeys do usuário logado', async () => {
      const res = await app.request('/api/auth/passkeys', {
        headers: { Authorization: `Bearer ${therapistToken}` }
      });

      expect(res.status).toBe(200);
      const data: PasskeyListResponse = await res.json();
      expect(data.success).toBe(true);
      expect(data.passkeys.length).toBe(1);
      expect(data.passkeys[0].friendlyName).toBe('YubiKey 5C NFC');
      expect(data.passkeys[0].id).toBe(createdPasskeyId);
    });

    it('deve revogar/excluir uma Passkey com registro na trilha WORM', async () => {
      const delRes = await app.request(`/api/auth/passkeys/${createdPasskeyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${therapistToken}` }
      });

      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.success).toBe(true);

      // Confirma que a lista agora está vazia
      const listRes = await app.request('/api/auth/passkeys', {
        headers: { Authorization: `Bearer ${therapistToken}` }
      });
      const listData = await listRes.json();
      expect(listData.passkeys.length).toBe(0);

      // Confirma auditoria WORM de desativação
      const auditLog = db.auditLogs.find(l => l.action === 'PASSKEY_REVOKE');
      expect(auditLog).toBeDefined();
    });

    it('deve impedir que um usuário revogue a Passkey pertencente a outro usuário', async () => {
      // Admin tenta revogar a Passkey do Psicólogo
      const res = await app.request(`/api/auth/passkeys/${createdPasskeyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('não tem permissão');
    });
  });
});
