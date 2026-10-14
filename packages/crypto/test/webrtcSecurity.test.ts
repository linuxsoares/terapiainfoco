import { describe, expect, it } from 'bun:test';
import {
  normalizeDtlsFingerprint,
  isValidDtlsFingerprint,
  generateSyntheticDtlsFingerprint,
  generateWebRtcSafetyNumbers,
  evaluateCipherSuite,
  calculateSessionProbataryDigest
} from '../src/webrtcSecurity';
import { WebRtcSecurityGrade, WebRtcVerificationStatus } from '@terapiainfoco/shared';

describe('WebRTC Security & DTLS Fingerprint Engine (RFC-001 §3.2 & CFP 011/2018)', () => {
  const validFp1 = 'SHA-256 A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2';
  const validFp2 = 'SHA-256 12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0';

  describe('normalizeDtlsFingerprint & isValidDtlsFingerprint', () => {
    it('deve validar um fingerprint estrito no formato RFC 8122', () => {
      expect(isValidDtlsFingerprint(validFp1)).toBe(true);
      expect(isValidDtlsFingerprint(validFp2)).toBe(true);
      expect(isValidDtlsFingerprint('invalid-fingerprint')).toBe(false);
      expect(isValidDtlsFingerprint('')).toBe(false);
    });

    it('deve normalizar fingerprints em minúsculas, com traços ou sem prefixo SHA-256', () => {
      const raw = 'a1:b2:c3:d4:e5:f6:a1:b2:c3:d4:e5:f6:a1:b2:c3:d4:e5:f6:a1:b2:c3:d4:e5:f6:a1:b2:c3:d4:e5:f6:a1:b2';
      const normalized = normalizeDtlsFingerprint(raw);
      expect(normalized).toBe(validFp1);
      expect(isValidDtlsFingerprint(normalized)).toBe(true);

      const rawWithDashes = 'A1-B2-C3-D4-E5-F6-A1-B2-C3-D4-E5-F6-A1-B2-C3-D4-E5-F6-A1-B2-C3-D4-E5-F6-A1-B2-C3-D4-E5-F6-A1-B2';
      expect(normalizeDtlsFingerprint(rawWithDashes)).toBe(validFp1);
    });

    it('deve rejeitar fingerprints com comprimento incorreto', () => {
      expect(() => normalizeDtlsFingerprint('A1:B2:C3')).toThrow('esperado 32 bytes');
    });

    it('deve gerar fingerprint sintético válido', () => {
      const synthetic = generateSyntheticDtlsFingerprint('test-seed-123');
      expect(isValidDtlsFingerprint(synthetic)).toBe(true);
      // Determinístico com a mesma seed
      expect(generateSyntheticDtlsFingerprint('test-seed-123')).toBe(synthetic);
    });
  });

  describe('generateWebRtcSafetyNumbers (SAS)', () => {
    it('deve gerar os mesmos Safety Numbers independentemente da ordem dos peers (simetria Alice/Bob)', () => {
      const sasForward = generateWebRtcSafetyNumbers(validFp1, validFp2);
      const sasReverse = generateWebRtcSafetyNumbers(validFp2, validFp1);

      expect(sasForward.safetyNumbers).toBe(sasReverse.safetyNumbers);
      expect(sasForward.phoneticSas).toBe(sasReverse.phoneticSas);
      expect(sasForward.numericBlocks).toHaveLength(4);
      expect(sasForward.safetyNumbers).toMatch(/^\d{5}\s\d{5}\s\d{5}\s\d{5}$/);
    });

    it('deve gerar palavras fonéticas legíveis para conferência verbal de sigilo', () => {
      const sas = generateWebRtcSafetyNumbers(validFp1, validFp2);
      expect(sas.phoneticSas.split('-')).toHaveLength(4);
      expect(typeof sas.phoneticSas).toBe('string');
    });

    it('deve gerar Safety Numbers completamente diferentes para fingerprints divergentes (Anti-MitM)', () => {
      const fpAttack = 'SHA-256 FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF';
      const legitimateSas = generateWebRtcSafetyNumbers(validFp1, validFp2);
      const mitmSas = generateWebRtcSafetyNumbers(validFp1, fpAttack);

      expect(legitimateSas.safetyNumbers).not.toBe(mitmSas.safetyNumbers);
      expect(legitimateSas.phoneticSas).not.toBe(mitmSas.phoneticSas);
    });
  });

  describe('evaluateCipherSuite', () => {
    it('deve classificar AEAD AES-256-GCM como OPTIMAL (100%)', () => {
      const eval256 = evaluateCipherSuite('SRTP_AEAD_AES_256_GCM', 'DTLS 1.3');
      expect(eval256.securityGrade).toBe(WebRtcSecurityGrade.OPTIMAL);
      expect(eval256.scorePercentage).toBe(100);
      expect(eval256.isAead).toBe(true);
      expect(eval256.hasPfs).toBe(true);
    });

    it('deve classificar AEAD AES-128-GCM como ACCEPTABLE (85%)', () => {
      const eval128 = evaluateCipherSuite('AEAD_AES_128_GCM', 'DTLS 1.2');
      expect(eval128.securityGrade).toBe(WebRtcSecurityGrade.ACCEPTABLE);
      expect(eval128.scorePercentage).toBe(85);
      expect(eval128.isAead).toBe(true);
    });

    it('deve classificar cifras legadas com HMAC-SHA1 como LEGACY', () => {
      const evalLegacy = evaluateCipherSuite('SRTP_AES128_CM_HMAC_SHA1_80', 'DTLS 1.2');
      expect(evalLegacy.securityGrade).toBe(WebRtcSecurityGrade.LEGACY);
      expect(evalLegacy.isAead).toBe(false);
      expect(evalLegacy.recommendations.some(r => r.includes('legado'))).toBe(true);
    });
  });

  describe('calculateSessionProbataryDigest', () => {
    it('deve gerar digest canônico determinístico de 64 caracteres hexadecimais (SHA-256)', () => {
      const params = {
        sessionId: 'session-test-001',
        appointmentId: 'appt-123',
        therapistId: 'therapist-1',
        patientId: 'patient-1',
        startedAt: '2026-10-14T10:00:00.000Z',
        therapistFingerprint: validFp1,
        patientFingerprint: validFp2,
        safetyNumbers: '48291 30194 82015 67123',
        cipherSuite: 'SRTP_AEAD_AES_256_GCM',
        verificationStatus: WebRtcVerificationStatus.VERIFIED_MATCH
      };

      const digest1 = calculateSessionProbataryDigest(params);
      const digest2 = calculateSessionProbataryDigest(params);

      expect(digest1).toHaveLength(64);
      expect(digest1).toBe(digest2);

      // Adulteração de qualquer parâmetro altera o digest
      const tampered = calculateSessionProbataryDigest({
        ...params,
        safetyNumbers: '00000 00000 00000 00000'
      });
      expect(tampered).not.toBe(digest1);
    });
  });
});
