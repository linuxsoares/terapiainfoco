import { describe, expect, it } from 'bun:test';
import {
  calculateSpkiPinSha256,
  calculateCertFingerprintSha256,
  matchHostname,
  detectMitmSignatures,
  createTlsPinProofSeal,
  verifyTlsPinProofSeal,
  evaluateTlsCertificatePinning
} from '../src/tlsPinningGuard';
import {
  TlsPinningStrategy,
  TlsPinValidationStatus,
  TlsPinPolicyMode
} from '@terapiainfoco/shared';
import type { TlsSpkiPin, X509CertInspection } from '@terapiainfoco/shared';

describe('TLS Certificate Pinning Guard Engine & Chain Verification (RFC-001 §4.4, §5.2 & OWASP MASVS)', () => {
  const dummyPublicKeyPem = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEEvO6vQh4a6WkQ+Q8+2R2EsmNkmr1
8eA9qY+o+V8mR1A4Q2x5E7j9X1sA3m8s9n2k3j4l5m6n7o8p9q0r1s2t3w==
-----END PUBLIC KEY-----`;

  const dummyCertPem = `-----BEGIN CERTIFICATE-----
MIIBtzCCAV2gAwIBAgIUeN7hK5...dummyCertContent...1234567890abcdef
-----END CERTIFICATE-----`;

  const samplePrimaryPin: TlsSpkiPin = {
    pinId: 'pin-primary-api-01',
    hostname: 'api.terapiainfoco.com.br',
    spkiSha256: calculateSpkiPinSha256(dummyPublicKeyPem),
    strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
    type: 'PRIMARY',
    caIssuer: "Let's Encrypt Authority X3",
    subjectCommonName: 'api.terapiainfoco.com.br',
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-12-31T23:59:59.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  const sampleBackupPin: TlsSpkiPin = {
    pinId: 'pin-backup-api-02',
    hostname: 'api.terapiainfoco.com.br',
    spkiSha256: 'pin-sha256="k2J8FvU3+mQZ0W+VnSgW6Z1uA9hK7eP4dC5tM8sB2wE="',
    strategy: TlsPinningStrategy.PUBLIC_KEY_SPKI,
    type: 'BACKUP_ROTATION',
    caIssuer: 'DigiCert Global Root G2',
    subjectCommonName: 'api.terapiainfoco.com.br',
    validFrom: '2026-06-01T00:00:00.000Z',
    validTo: '2027-06-01T23:59:59.000Z',
    createdAt: '2026-06-01T00:00:00.000Z'
  };

  describe('Cálculo Canônico de SPKI Pin SHA-256 (RFC 7469) e Fingerprint', () => {
    it('deve calcular digest SPKI SHA-256 no formato RFC 7469 pin-sha256="..."', () => {
      const pin = calculateSpkiPinSha256(dummyPublicKeyPem);
      expect(pin).toMatch(/^pin-sha256="[A-Za-z0-9+/=]+"$/);
    });

    it('deve calcular digest idêntico para Buffer DER e string PEM normalizada', () => {
      const cleanBase64 = dummyPublicKeyPem
        .replace(/-----BEGIN PUBLIC KEY-----/g, '')
        .replace(/-----END PUBLIC KEY-----/g, '')
        .replace(/[\r\n\s]/g, '');
      const derBuffer = Buffer.from(cleanBase64, 'base64');

      const pinFromPem = calculateSpkiPinSha256(dummyPublicKeyPem);
      const pinFromDer = calculateSpkiPinSha256(derBuffer);
      expect(pinFromPem).toBe(pinFromDer);
    });

    it('deve calcular Fingerprint SHA-256 de certificado em formato hexadecimal com dois pontos', () => {
      const fp = calculateCertFingerprintSha256(dummyCertPem);
      expect(fp).toMatch(/^([0-9A-F]{2}:)+[0-9A-F]{2}$/);
    });
  });

  describe('Validação Estrita de Hostname & SAN (Subject Alternative Name)', () => {
    it('deve validar correspondência exata de hostname', () => {
      expect(matchHostname('api.terapiainfoco.com.br', 'api.terapiainfoco.com.br')).toBe(true);
      expect(matchHostname('API.terapiainfoco.com.br', 'api.terapiainfoco.com.br')).toBe(true);
      expect(matchHostname('meet.terapiainfoco.com.br', 'api.terapiainfoco.com.br')).toBe(false);
    });

    it('deve suportar wildcard com segurança apenas para o primeiro subdomínio', () => {
      expect(matchHostname('api.terapiainfoco.com.br', '*.terapiainfoco.com.br')).toBe(true);
      expect(matchHostname('meet.terapiainfoco.com.br', '*.terapiainfoco.com.br')).toBe(true);
      // Não deve permitir wildcard de múltiplos níveis
      expect(matchHostname('sub.api.terapiainfoco.com.br', '*.terapiainfoco.com.br')).toBe(false);
    });

    it('deve rejeitar wildcards em TLDs públicos ou sem domínio base suficiente', () => {
      expect(matchHostname('api.com.br', '*.com.br')).toBe(false);
      expect(matchHostname('terapiainfoco.com', '*.com')).toBe(false);
    });
  });

  describe('Detecção de Assinaturas de Proxy MitM & CAs em Quarentena', () => {
    it('deve detectar PortSwigger / Burp Suite CA como interceptor MitM', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: 'AA:BB:CC',
        spkiSha256: 'pin-sha256="fake"',
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: 'PortSwigger CA',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '12345',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const signatures = detectMitmSignatures(cert);
      expect(signatures.some(s => s.includes('PortSwigger'))).toBe(true);
    });

    it('deve detectar Charles Proxy e Fiddler como interceptores', () => {
      const certCharles: X509CertInspection = {
        fingerprintSha256: '11:22:33',
        spkiSha256: 'pin-sha256="fake2"',
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: [],
        issuerCN: 'Charles Proxy CA (15 Oct 2026)',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '999',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      expect(detectMitmSignatures(certCharles).some(s => s.includes('Charles Proxy'))).toBe(true);
    });

    it('deve detectar CA colocada expressamente em quarentena', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '33:44:55',
        spkiSha256: 'pin-sha256="fake3"',
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: 'Compromised Commercial CA Inc',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '777',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const quarantined = ['Compromised Commercial CA'];
      const detected = detectMitmSignatures(cert, quarantined);
      expect(detected.some(d => d.includes('QUARANTINED_ROGUE_CA'))).toBe(true);
    });

    it('não deve emitir alertas para CA legítima (Let\'s Encrypt / DigiCert)', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '00:11:22',
        spkiSha256: samplePrimaryPin.spkiSha256,
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: "ISRG Root X1 / Let's Encrypt",
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '555',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const detected = detectMitmSignatures(cert);
      expect(detected.length).toBe(0);
    });
  });

  describe('Selo Notarial Probatório WORM HMAC-SHA256', () => {
    it('deve gerar e verificar selo íntegro com sucesso (100% autêntico)', () => {
      const seal = createTlsPinProofSeal({
        hostname: 'api.terapiainfoco.com.br',
        status: TlsPinValidationStatus.PIN_MATCH_PRIMARY,
        matchedPinId: samplePrimaryPin.pinId,
        presentedFingerprint: 'AA:BB:CC',
        spkiSha256: samplePrimaryPin.spkiSha256,
        threatLevel: 'NONE'
      });

      expect(seal.token).toMatch(/^tls_pin_v1_[A-Za-z0-9_-]+$/);

      const verification = verifyTlsPinProofSeal(seal.token);
      expect(verification.isValid).toBe(true);
      expect(verification.seal?.hostname).toBe('api.terapiainfoco.com.br');
      expect(verification.seal?.status).toBe(TlsPinValidationStatus.PIN_MATCH_PRIMARY);
    });

    it('deve rejeitar selo com assinatura HMAC forjada', () => {
      const seal = createTlsPinProofSeal({
        hostname: 'api.terapiainfoco.com.br',
        status: TlsPinValidationStatus.PIN_MATCH_PRIMARY,
        presentedFingerprint: 'AA:BB:CC',
        spkiSha256: samplePrimaryPin.spkiSha256,
        threatLevel: 'NONE'
      }, 'real-secret-123');

      const verification = verifyTlsPinProofSeal(seal.token, 'attacker-fake-secret');
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('forjada ou adulterada');
    });

    it('deve rejeitar token com prefixo inválido', () => {
      const verification = verifyTlsPinProofSeal('invalid_prefix_abc123');
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('Prefixo');
    });
  });

  describe('Avaliação Completa de TLS Pinning (evaluateTlsCertificatePinning)', () => {
    it('deve aprovar certificado correspondente ao Primary Pin (PIN_MATCH_PRIMARY)', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '11:22:33:44',
        spkiSha256: samplePrimaryPin.spkiSha256,
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: "Let's Encrypt Authority X3",
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '1001',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin, sampleBackupPin],
        now: new Date('2026-06-15T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.PIN_MATCH_PRIMARY);
      expect(result.threatLevel).toBe('NONE');
      expect(result.chainValid).toBe(true);
      expect(result.matchedPin?.pinId).toBe('pin-primary-api-01');
      expect(result.proofSeal.token).toBeDefined();
    });

    it('deve aprovar com alerta leve certificado correspondente a Backup Pin (PIN_MATCH_BACKUP)', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '55:66:77:88',
        spkiSha256: sampleBackupPin.spkiSha256,
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: 'DigiCert Global Root G2',
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: '2027-06-01T23:59:59.000Z',
        serialNumber: '1002',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin, sampleBackupPin],
        now: new Date('2026-07-01T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.PIN_MATCH_BACKUP);
      expect(result.threatLevel).toBe('LOW');
      expect(result.chainValid).toBe(true);
      expect(result.matchedPin?.pinId).toBe('pin-backup-api-02');
      expect(result.recommendation).toContain('Rotação Suave');
    });

    it('deve bloquear e classificar como CRITICAL_MITM quando a chave pública não confere com nenhum Pin', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '99:88:77:66',
        spkiSha256: 'pin-sha256="UNKNOWN_RANDOM_PUBLIC_KEY_ABC="',
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: 'Some Other Trusted Looking CA',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '9999',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin, sampleBackupPin],
        now: new Date('2026-06-15T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.PIN_MISMATCH_SUSPECTED_MITM);
      expect(result.threatLevel).toBe('CRITICAL_MITM');
      expect(result.chainValid).toBe(false);
      expect(result.recommendation).toContain('ALERTA DE SEGURANÇA');
    });

    it('deve bloquear com CHAIN_UNTRUSTED_ROGUE_CA quando detectada CA de interceptação Burp Suite', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: 'CA:FE:BA:BE',
        spkiSha256: 'pin-sha256="BURP_KEY_SAMPLE="',
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: 'PortSwigger CA',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '888',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin],
        now: new Date('2026-06-15T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.CHAIN_UNTRUSTED_ROGUE_CA);
      expect(result.threatLevel).toBe('CRITICAL_MITM');
      expect(result.chainValid).toBe(false);
      expect(result.mitmSignaturesDetected.some(s => s.includes('PortSwigger'))).toBe(true);
    });

    it('deve acusar CERTIFICATE_EXPIRED quando data atual estiver fora do período de validade', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '11:22:33:44',
        spkiSha256: samplePrimaryPin.spkiSha256,
        subjectCN: 'api.terapiainfoco.com.br',
        subjectAltNames: ['api.terapiainfoco.com.br'],
        issuerCN: "Let's Encrypt Authority X3",
        validFrom: '2025-01-01T00:00:00.000Z',
        validTo: '2025-12-31T23:59:59.000Z', // Expirado em 2026
        serialNumber: '1001',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin],
        now: new Date('2026-06-15T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.CERTIFICATE_EXPIRED);
      expect(result.threatLevel).toBe('HIGH');
      expect(result.chainValid).toBe(false);
    });

    it('deve acusar SAN_MISMATCH quando certificado não cobre o domínio requisitado', () => {
      const cert: X509CertInspection = {
        fingerprintSha256: '11:22:33:44',
        spkiSha256: samplePrimaryPin.spkiSha256,
        subjectCN: 'unrelated-phishing-domain.com',
        subjectAltNames: ['unrelated-phishing-domain.com'],
        issuerCN: "Let's Encrypt Authority X3",
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        serialNumber: '1001',
        signatureAlgorithm: 'sha256WithRSAEncryption',
        publicKeyBitLength: 2048
      };

      const result = evaluateTlsCertificatePinning({
        hostname: 'api.terapiainfoco.com.br',
        presentedCertificate: cert,
        configuredPins: [samplePrimaryPin],
        now: new Date('2026-06-15T12:00:00.000Z')
      });

      expect(result.status).toBe(TlsPinValidationStatus.SAN_MISMATCH);
      expect(result.threatLevel).toBe('HIGH');
      expect(result.chainValid).toBe(false);
    });
  });
});
