import { describe, expect, it } from 'bun:test';
import {
  bufferToBase64Url,
  base64UrlToBuffer,
  generateWebAuthnChallenge,
  parseClientDataJSON,
  parseAuthenticatorData,
  verifyWebAuthnAssertionSignature,
  createSimulatedWebAuthnKeyPair,
  createSimulatedWebAuthnAssertion
} from '../src/webauthn';

describe('WebAuthn / Passkeys Engine (FIDO2 / TouchID / FaceID - RFC-001 Opção O)', () => {
  it('deve codificar e decodificar Base64URL sem padding e sem caracteres inválidos para URLs', () => {
    const raw = Buffer.from('TerapiaInFoco WebAuthn P-256 + / == 2026');
    const b64url = bufferToBase64Url(raw);

    expect(b64url).not.toContain('+');
    expect(b64url).not.toContain('/');
    expect(b64url).not.toContain('=');

    const decoded = base64UrlToBuffer(b64url);
    expect(decoded.toString('utf-8')).toBe('TerapiaInFoco WebAuthn P-256 + / == 2026');
  });

  it('deve gerar desafios aleatórios seguros de 32 bytes (256 bits)', () => {
    const challenge1 = generateWebAuthnChallenge();
    const challenge2 = generateWebAuthnChallenge();

    expect(challenge1).toBeDefined();
    expect(challenge2).toBeDefined();
    expect(challenge1).not.toBe(challenge2);

    const buf1 = base64UrlToBuffer(challenge1);
    expect(buf1.length).toBe(32);
  });

  it('deve decodificar clientDataJSON e verificar atributos essenciais', () => {
    const challenge = generateWebAuthnChallenge();
    const rawClientData = JSON.stringify({
      type: 'webauthn.create',
      challenge,
      origin: 'https://terapiainfoco.com.br',
      crossOrigin: false
    });
    const b64 = bufferToBase64Url(Buffer.from(rawClientData));

    const parsed = parseClientDataJSON(b64);
    expect(parsed.type).toBe('webauthn.create');
    expect(parsed.challenge).toBe(challenge);
    expect(parsed.origin).toBe('https://terapiainfoco.com.br');
  });

  it('deve gerar e decodificar authenticatorData com flags UP (User Present) e UV (User Verified / Biometria)', () => {
    const challenge = generateWebAuthnChallenge();
    const rpId = 'terapiainfoco.com.br';
    const origin = 'https://terapiainfoco.com.br';

    const simulated = createSimulatedWebAuthnKeyPair(rpId, challenge, origin);
    const parsed = parseAuthenticatorData(simulated.authenticatorData);

    expect(parsed.flags.userPresent).toBe(true);
    expect(parsed.flags.userVerified).toBe(true);
    expect(parsed.flags.attestedDataIncluded).toBe(true);
    expect(parsed.credentialId).toBe(simulated.credentialId);
    expect(parsed.signCount).toBe(0);
    expect(parsed.aaguid).toBeDefined();
  });

  it('deve validar assinatura de asserção (login com Passkey) com chave ECDSA P-256 (ES256)', () => {
    const rpId = 'terapiainfoco.com.br';
    const origin = 'https://terapiainfoco.com.br';
    const regChallenge = generateWebAuthnChallenge();

    // 1. Registro da Passkey
    const credential = createSimulatedWebAuthnKeyPair(rpId, regChallenge, origin);

    // 2. Desafio de Login
    const authChallenge = generateWebAuthnChallenge();
    const assertion = createSimulatedWebAuthnAssertion({
      rpId,
      challenge: authChallenge,
      origin,
      privateKey: credential.privateKey,
      signCount: 1
    });

    // 3. Verificação de Assinatura no Servidor
    const isValid = verifyWebAuthnAssertionSignature({
      publicKeyPem: credential.publicKeyPem,
      authenticatorData: assertion.authenticatorData,
      clientDataJSON: assertion.clientDataJSON,
      signature: assertion.signature
    });

    expect(isValid).toBe(true);
  });

  it('deve rejeitar assinatura se o payload clientDataJSON for adulterado (Anti-Tampering)', () => {
    const rpId = 'terapiainfoco.com.br';
    const origin = 'https://terapiainfoco.com.br';
    const regChallenge = generateWebAuthnChallenge();

    const credential = createSimulatedWebAuthnKeyPair(rpId, regChallenge, origin);

    const authChallenge = generateWebAuthnChallenge();
    const assertion = createSimulatedWebAuthnAssertion({
      rpId,
      challenge: authChallenge,
      origin,
      privateKey: credential.privateKey
    });

    // Adulteração do clientDataJSON (ex: atacante alterando challenge ou origin)
    const tamperedClientData = JSON.stringify({
      type: 'webauthn.get',
      challenge: 'hacker-fake-challenge',
      origin: 'https://evil-phishing.com'
    });
    const tamperedClientDataJSON = bufferToBase64Url(Buffer.from(tamperedClientData));

    const isValid = verifyWebAuthnAssertionSignature({
      publicKeyPem: credential.publicKeyPem,
      authenticatorData: assertion.authenticatorData,
      clientDataJSON: tamperedClientDataJSON,
      signature: assertion.signature
    });

    expect(isValid).toBe(false);
  });

  it('deve rejeitar assinatura se for verificada com chave pública de outra credencial', () => {
    const rpId = 'terapiainfoco.com.br';
    const origin = 'https://terapiainfoco.com.br';

    // Credencial legítima do usuário A
    const credA = createSimulatedWebAuthnKeyPair(rpId, generateWebAuthnChallenge(), origin);
    // Credencial do usuário B
    const credB = createSimulatedWebAuthnKeyPair(rpId, generateWebAuthnChallenge(), origin);

    // Usuário B gera assertion com sua chave privada
    const assertionB = createSimulatedWebAuthnAssertion({
      rpId,
      challenge: generateWebAuthnChallenge(),
      origin,
      privateKey: credB.privateKey
    });

    // Servidor tenta validar a assinatura de B usando a chave pública de A
    const isValid = verifyWebAuthnAssertionSignature({
      publicKeyPem: credA.publicKeyPem,
      authenticatorData: assertionB.authenticatorData,
      clientDataJSON: assertionB.clientDataJSON,
      signature: assertionB.signature
    });

    expect(isValid).toBe(false);
  });
});
