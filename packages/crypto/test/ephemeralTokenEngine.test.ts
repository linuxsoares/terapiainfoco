import { describe, it, expect } from 'bun:test';
import {
  EphemeralTokenStatus,
  EphemeralTokenTarget,
  RevocationReason,
  EphemeralTokenVerificationVerdict
} from '@terapiainfoco/shared';
import {
  issueEphemeralAccessToken,
  verifyEphemeralAccessToken,
  createEphemeralProofSeal,
  verifyEphemeralProofSeal,
  generatePatientBlindIndex,
  maskPatientId,
  toBase64Url,
  fromBase64Url
} from '../src/ephemeralTokenEngine';

describe('Ephemeral Teleconsult Tokens & Auto-Revocation Engine (RFC 7519, RFC 7009 & LGPD Art. 46)', () => {
  const sampleParams = {
    patientId: 'paciente_camila_costa_789',
    therapistCrp: 'CRP-06/987654',
    roomId: 'sala_telepsi_supervisada_01',
    target: EphemeralTokenTarget.TELECONSULTATION_ROOM,
    ttlMinutes: 60,
    validInAdvanceMinutes: 15,
    singleUse: true
  };

  describe('Emissão Criptográfica de Tokens Efêmeros (RFC 7519 JWT)', () => {
    it('deve emitir token efêmero assinado com HMAC-SHA256 e estrutura compacta válida', () => {
      const { token, tokenString, magicLink } = issueEphemeralAccessToken(sampleParams);

      expect(token.tokenId).toStartWith('eph_');
      expect(tokenString.split('.')).toHaveLength(3);
      expect(magicLink).toContain(encodeURIComponent(tokenString));
      expect(token.status).toBe(EphemeralTokenStatus.ACTIVE_PENDING);
      expect(token.singleUse).toBe(true);
      expect(token.proofSeal.sealToken).toStartWith('ephemeral_v1_');
    });

    it('deve gerar blind index determinístico e mascarar ID do paciente para LGPD', () => {
      const blind1 = generatePatientBlindIndex('paciente_123');
      const blind2 = generatePatientBlindIndex('paciente_123');
      const blindOther = generatePatientBlindIndex('paciente_999');

      expect(blind1).toBe(blind2);
      expect(blind1).not.toBe(blindOther);
      expect(maskPatientId('paciente_123')).toBe('pac***123');
    });
  });

  describe('Validação & Vereditos Temporais e Criptográficos', () => {
    it('deve conceder acesso a token autêntico e tempestivo (VALID_GRANTED)', () => {
      const { tokenString } = issueEphemeralAccessToken(sampleParams);
      const res = verifyEphemeralAccessToken(tokenString, sampleParams.roomId);

      expect(res.verdict).toBe(EphemeralTokenVerificationVerdict.VALID_GRANTED);
      expect(res.isValid).toBe(true);
      expect(res.payload?.therapistCrp).toBe(sampleParams.therapistCrp);
      expect(res.payload?.roomId).toBe(sampleParams.roomId);
    });

    it('deve rejeitar token com assinatura adulterada (SIGNATURE_INVALID)', () => {
      const { tokenString } = issueEphemeralAccessToken(sampleParams);
      const [header, payload, sig] = tokenString.split('.');
      // Modifica um caractere da assinatura
      const tamperedSig = sig.slice(0, -2) + 'AA';
      const tamperedToken = `${header}.${payload}.${tamperedSig}`;

      const res = verifyEphemeralAccessToken(tamperedToken, sampleParams.roomId);

      expect(res.verdict).toBe(EphemeralTokenVerificationVerdict.SIGNATURE_INVALID);
      expect(res.isValid).toBe(false);
    });

    it('deve rejeitar tentativa de acesso em sala clínica divergente (ROOM_MISMATCH)', () => {
      const { tokenString } = issueEphemeralAccessToken(sampleParams);
      const res = verifyEphemeralAccessToken(tokenString, 'outra_sala_invasora');

      expect(res.verdict).toBe(EphemeralTokenVerificationVerdict.ROOM_MISMATCH);
      expect(res.isValid).toBe(false);
    });

    it('deve rejeitar token expirado (TOKEN_EXPIRED)', () => {
      // Emite token com TTL negativo para simular expiração imediata
      const { tokenString } = issueEphemeralAccessToken({
        ...sampleParams,
        ttlMinutes: -10, // expirou há 10 minutos
        validInAdvanceMinutes: 20
      });

      const res = verifyEphemeralAccessToken(tokenString, sampleParams.roomId, 0);

      expect(res.verdict).toBe(EphemeralTokenVerificationVerdict.TOKEN_EXPIRED);
      expect(res.isValid).toBe(false);
    });

    it('deve rejeitar tentativa de acesso prematuro antes de nbf (PREMATURE_ACCESS_NBF)', () => {
      // Token válido apenas no futuro (advanceMinutes negativo)
      const { tokenString } = issueEphemeralAccessToken({
        ...sampleParams,
        validInAdvanceMinutes: -30 // válido apenas daqui a 30 min
      });

      const res = verifyEphemeralAccessToken(tokenString, sampleParams.roomId, 0);

      expect(res.verdict).toBe(EphemeralTokenVerificationVerdict.PREMATURE_ACCESS_NBF);
      expect(res.isValid).toBe(false);
    });
  });

  describe('Selo Probatório WORM HMAC-SHA256 & RFC 8785 (Não-Repúdio)', () => {
    it('deve emitir e validar selo probatório WORM de token efêmero com sucesso', () => {
      const seal = createEphemeralProofSeal({
        tokenId: 'eph_test_456',
        action: 'EPHEMERAL_TOKEN_REVOKED',
        details: { reason: RevocationReason.THERAPIST_FORCE_KILL }
      });

      expect(seal.sealToken).toStartWith('ephemeral_v1_');
      expect(seal.canonicalDigest).toHaveLength(64);

      const verification = verifyEphemeralProofSeal(seal.sealToken);
      expect(verification.isValid).toBe(true);
      expect(verification.payload.tokenId).toBe('eph_test_456');
      expect(verification.payload.action).toBe('EPHEMERAL_TOKEN_REVOKED');
    });

    it('deve rejeitar selo probatório com assinatura adulterada ou token forjado', () => {
      const seal = createEphemeralProofSeal({
        tokenId: 'eph_test_789',
        action: 'EPHEMERAL_TOKEN_ISSUED',
        details: { test: true }
      });

      // Modifica o conteúdo Base64URL do selo
      const tamperedToken = seal.sealToken.slice(0, -3) + 'xyz';
      const verification = verifyEphemeralProofSeal(tamperedToken);

      expect(verification.isValid).toBe(false);
    });
  });

  describe('Utilitários Criptográficos Base64URL', () => {
    it('deve codificar e decodificar dados em Base64URL sem padding e sem caracteres inválidos para URLs', () => {
      const rawText = 'TerapiaInFoco Teleconsulta Segura 2026? & + / =';
      const b64Url = toBase64Url(rawText);

      expect(b64Url).not.toContain('+');
      expect(b64Url).not.toContain('/');
      expect(b64Url).not.toContain('=');

      const restored = fromBase64Url(b64Url).toString('utf-8');
      expect(restored).toBe(rawText);
    });
  });
});
