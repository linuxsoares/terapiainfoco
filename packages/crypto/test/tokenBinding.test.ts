import { describe, it, expect } from 'bun:test';
import {
  generateClientDeviceKeyPair,
  calculateJwkThumbprint,
  createDpopProof,
  verifyDpopProof,
  generateSessionRevocationProof,
  verifySessionRevocationProof
} from '../src/tokenBinding';
import {
  SessionBindingMode,
  SessionLifecycleStatus,
  SessionDeviceType,
  type ClinicalActiveSession
} from '@terapiainfoco/shared';

describe('Token Binding & DPoP Engine (RFC 9449 / RFC 7638 / RFC-001 §4.4)', () => {
  it('deve gerar par de chaves do dispositivo e calcular JWK Thumbprint RFC 7638 determinístico', () => {
    const keyPair = generateClientDeviceKeyPair();
    expect(keyPair.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.jwk.kty).toBe('EC');
    expect(keyPair.jwk.crv).toBe('P-256');
    expect(keyPair.thumbprint.length).toBeGreaterThan(20);

    // O thumbprint para o mesmo JWK deve ser determinístico
    const recomputed = calculateJwkThumbprint(keyPair.jwk);
    expect(recomputed).toBe(keyPair.thumbprint);
  });

  it('deve criar prova de posse DPoP e verificar com 100% de sucesso com método e URI corretos', () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/clinical-records/rec-123';
    const method = 'GET';

    const proof = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: method,
      httpUri: uri
    });

    expect(proof.split('.').length).toBe(3);

    const verification = verifyDpopProof(proof, method, uri);
    expect(verification.isValid).toBe(true);
    expect(verification.clientThumbprint).toBe(keyPair.thumbprint);
    expect(verification.claims).toBeDefined();
    expect(verification.claims?.htm).toBe('GET');
  });

  it('deve validar correspondência estrita com Access Token Hash (ath)', () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/appointments';
    const method = 'POST';
    const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid-clinical-token';

    const proof = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: method,
      httpUri: uri,
      accessToken
    });

    // Verificação com o token correto deve passar
    const validCheck = verifyDpopProof(proof, method, uri, accessToken);
    expect(validCheck.isValid).toBe(true);

    // Verificação com token adulterado deve ser rejeitada
    const invalidCheck = verifyDpopProof(proof, method, uri, 'token-divergente-roubado');
    expect(invalidCheck.isValid).toBe(false);
    expect(invalidCheck.error).toContain('Hash do Access Token (ath) divergente');
  });

  it('deve rejeitar prova DPoP se o método HTTP ou URI forem divergentes', () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/patients/pt-1';
    const proof = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: 'GET',
      httpUri: uri
    });

    // Método divergente (POST em vez de GET)
    const methodMismatch = verifyDpopProof(proof, 'POST', uri);
    expect(methodMismatch.isValid).toBe(false);
    expect(methodMismatch.error).toContain('Método HTTP DPoP divergente');

    // URI divergente
    const uriMismatch = verifyDpopProof(proof, 'GET', 'https://api.terapiainfoco.com.br/api/other-route');
    expect(uriMismatch.isValid).toBe(false);
    expect(uriMismatch.error).toContain('URI de destino DPoP divergente');
  });

  it('deve rejeitar prova DPoP com timestamp expirado fora da janela de tolerância', () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/health';
    const expiredIat = Math.floor(Date.now() / 1000) - 600; // 10 minutos atrás

    const proof = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: 'GET',
      httpUri: uri,
      iat: expiredIat
    });

    const verification = verifyDpopProof(proof, 'GET', uri, undefined, 300); // tolerância 5 min
    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('expirada');
  });

  it('deve rejeitar prova DPoP se a assinatura criptográfica for corrompida (Anti-Tampering)', () => {
    const keyPair = generateClientDeviceKeyPair();
    const uri = 'https://api.terapiainfoco.com.br/api/teleconsultation';
    const proof = createDpopProof({
      privateKeyPem: keyPair.privateKeyPem,
      jwk: keyPair.jwk,
      httpMethod: 'GET',
      httpUri: uri
    });

    const parts = proof.split('.');
    // Adulteração intencional de 1 byte na assinatura
    const tamperedSig = parts[2].slice(0, 5) + (parts[2][5] === 'A' ? 'B' : 'A') + parts[2].slice(6);
    const tamperedProof = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const verification = verifyDpopProof(tamperedProof, 'GET', uri);
    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Assinatura digital');
  });

  it('deve gerar selo probatório WORM de revogação de sessão e validar integridade pericial', () => {
    const session: ClinicalActiveSession = {
      sessionId: 'sess-macbook-pro-1',
      userId: 'usr-therapist-1',
      therapistCrp: '06/123456',
      deviceType: SessionDeviceType.DESKTOP,
      deviceName: 'MacBook Pro 16" (macOS / Safari)',
      ipAddress: '189.40.10.15',
      location: 'São Paulo, SP - BR',
      bindingMode: SessionBindingMode.DPOP_BOUND,
      clientJkt: 'thumbprint-client-device-1',
      status: SessionLifecycleStatus.REVOKED_BY_USER,
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      lastActivityAt: new Date().toISOString(),
      isCurrentDevice: false,
      revokedAt: new Date().toISOString(),
      revocationReason: 'Encerramento forçado remoto via painel clínico'
    };

    const seal = generateSessionRevocationProof(session);
    expect(seal).toStartWith('session_rev_v1_');

    const verification = verifySessionRevocationProof(seal, session);
    expect(verification.isValid).toBe(true);
    expect(verification.sessionId).toBe(session.sessionId);
    expect(verification.userId).toBe(session.userId);
    expect(verification.details).toContain('matematicamente íntegro');
  });

  it('deve detectar violação e adulteração caso os dados da sessão revogada sejam alterados retroativamente', () => {
    const session: ClinicalActiveSession = {
      sessionId: 'sess-iphone-15',
      userId: 'usr-therapist-1',
      deviceType: SessionDeviceType.MOBILE,
      deviceName: 'iPhone 15 Pro (iOS / Safari)',
      ipAddress: '177.18.99.10',
      location: 'Rio de Janeiro, RJ - BR',
      bindingMode: SessionBindingMode.DPOP_BOUND,
      status: SessionLifecycleStatus.REVOKED_BY_CONCURRENCY,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      isCurrentDevice: false,
      revokedAt: new Date().toISOString(),
      revocationReason: 'Limite de concorrência excedido'
    };

    const seal = generateSessionRevocationProof(session);

    // Tentativa de adulterar a razão ou o IP retroativamente
    const tamperedSession = {
      ...session,
      ipAddress: '200.100.50.25'
    };

    const verification = verifySessionRevocationProof(seal, tamperedSession);
    expect(verification.isValid).toBe(false);
    expect(verification.details).toContain('Digest canônico SHA-256 divergente');
  });
});
