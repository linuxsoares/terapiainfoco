import { describe, it, expect } from 'bun:test';
import {
  generatePurgeBlindIndex,
  calculatePurgeProofHash,
  encodePurgeSeal,
  decodePurgeSeal,
  verifyPurgeCertificateIntegrity,
  simulateCryptoShredding
} from '../src/securePurge';
import {
  PurgeReason,
  PurgeMethod,
  PurgeStatus,
  PurgeProofVerificationStatus,
  type DataPurgeCertificate
} from '@terapiainfoco/shared';

describe('Secure Data Purge & Cryptographic Erasure Engine (LGPD Art. 16 & CFP nº 001/2009)', () => {
  it('deve gerar Blind Index determinístico para o mesmo paciente e normalizar espaços/maiúsculas', () => {
    const blindIndex1 = generatePurgeBlindIndex('patient-1234');
    const blindIndex2 = generatePurgeBlindIndex('  PATIENT-1234  ');
    const blindIndexDifferent = generatePurgeBlindIndex('patient-9999');

    expect(blindIndex1).toBe(blindIndex2);
    expect(blindIndex1).toHaveLength(64);
    expect(blindIndex1).not.toBe(blindIndexDifferent);
  });

  it('deve calcular hash canônico SHA-256 invariante independentemente da ordem dos recordIds', () => {
    const paramsA = {
      certificateId: 'PURGE-2026-CERT-0001',
      patientBlindIndex: 'abc123blindindex',
      recordsPurgedCount: 3,
      recordIdsPurged: ['rec-3', 'rec-1', 'rec-2'],
      purgedAt: '2026-10-14T10:00:00.000Z',
      purgeReason: PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      dpoApproverId: 'dpo-usr-1'
    };

    const paramsB = {
      ...paramsA,
      recordIdsPurged: ['rec-1', 'rec-2', 'rec-3']
    };

    const hashA = calculatePurgeProofHash(paramsA);
    const hashB = calculatePurgeProofHash(paramsB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it('deve alterar o hash canônico se qualquer metadado for modificado', () => {
    const baseParams = {
      certificateId: 'PURGE-2026-CERT-0001',
      patientBlindIndex: 'abc123blindindex',
      recordsPurgedCount: 1,
      recordIdsPurged: ['rec-1'],
      purgedAt: '2026-10-14T10:00:00.000Z',
      purgeReason: PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      dpoApproverId: 'dpo-usr-1'
    };

    const hashOriginal = calculatePurgeProofHash(baseParams);
    const hashTampered = calculatePurgeProofHash({
      ...baseParams,
      recordsPurgedCount: 2
    });

    expect(hashOriginal).not.toBe(hashTampered);
  });

  it('deve codificar e decodificar perfeitamente o token público de expurgo purge_v1_*', () => {
    const payload = {
      certificateId: 'PURGE-2026-CERT-8841',
      patientBlindIndex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      canonicalProofHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      purgedAt: '2026-10-14T15:00:00.000Z',
      recordsPurgedCount: 12
    };

    const sealToken = encodePurgeSeal(payload);
    expect(sealToken.startsWith('purge_v1_')).toBe(true);

    const decoded = decodePurgeSeal(sealToken);
    expect(decoded.certificateId).toBe(payload.certificateId);
    expect(decoded.patientBlindIndex).toBe(payload.patientBlindIndex);
    expect(decoded.canonicalProofHash).toBe(payload.canonicalProofHash);
    expect(decoded.purgedAt).toBe(payload.purgedAt);
    expect(decoded.recordsPurgedCount).toBe(payload.recordsPurgedCount);
  });

  it('deve rejeitar tokens de expurgo adulterados ou com formato inválido', () => {
    expect(() => decodePurgeSeal('invalid_prefix_token')).toThrow();
    expect(() => decodePurgeSeal('purge_v1_corrupted!!!base64')).toThrow();
  });

  it('deve verificar com sucesso a integridade de uma certidão de expurgo autêntica', () => {
    const certificateId = 'PURGE-2026-CERT-VALID-01';
    const patientBlindIndex = generatePurgeBlindIndex('patient-test-valid');
    const recordIdsPurged = ['rec-a', 'rec-b'];
    const purgedAt = '2026-10-14T14:30:00.000Z';
    const purgeReason = PurgeReason.RETENTION_PERIOD_EXPIRED_5_YEARS;
    const purgeMethod = PurgeMethod.CRYPTO_SHREDDING_NIST_800_88;
    const dpoApproverId = 'dpo-master';

    const canonicalProofHash = calculatePurgeProofHash({
      certificateId,
      patientBlindIndex,
      recordsPurgedCount: recordIdsPurged.length,
      recordIdsPurged,
      purgedAt,
      purgeReason,
      purgeMethod,
      dpoApproverId
    });

    const cryptographicPurgeSeal = encodePurgeSeal({
      certificateId,
      patientBlindIndex,
      canonicalProofHash,
      purgedAt,
      recordsPurgedCount: recordIdsPurged.length
    });

    const cert: DataPurgeCertificate = {
      certificateId,
      issuedAt: purgedAt,
      patientBlindIndex,
      patientIdMasked: 'pat-***-001',
      therapistId: 'therapist-1',
      dpoApproverId,
      recordsPurgedCount: recordIdsPurged.length,
      recordIdsPurged,
      sessionsPurgedCount: 2,
      audioShardsPurgedCount: 4,
      purgeReason,
      purgeMethod,
      status: PurgeStatus.PURGED_CONFIRMED,
      purgedAt,
      inactivityPeriodMonths: 62,
      canonicalProofHash,
      cryptographicPurgeSeal,
      retentionPolicyCompliance: 'Em conformidade com Art. 2º §2º CFP 001/2009 e LGPD Art. 16',
      verifierUrl: `https://terapiainfoco.com.br/verify/purge?seal=${cryptographicPurgeSeal}`
    };

    const verification = verifyPurgeCertificateIntegrity(cert);
    expect(verification.valid).toBe(true);
    expect(verification.status).toBe(PurgeProofVerificationStatus.PROOF_VALID_AUTHENTIC);
    expect(verification.calculatedProofHash).toBe(canonicalProofHash);
  });

  it('deve acusar PROOF_TAMPERED se a certidão sofrer adulteração retroativa', () => {
    const certificateId = 'PURGE-2026-CERT-TAMPER';
    const patientBlindIndex = generatePurgeBlindIndex('patient-tamper');
    const recordIdsPurged = ['rec-x'];
    const purgedAt = '2026-10-14T14:30:00.000Z';

    const canonicalProofHash = calculatePurgeProofHash({
      certificateId,
      patientBlindIndex,
      recordsPurgedCount: 1,
      recordIdsPurged,
      purgedAt,
      purgeReason: PurgeReason.PATIENT_REQUEST_ART_18,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      dpoApproverId: 'dpo-test'
    });

    const cert: DataPurgeCertificate = {
      certificateId,
      issuedAt: purgedAt,
      patientBlindIndex,
      patientIdMasked: 'pat-***-tamper',
      therapistId: 'therapist-1',
      dpoApproverId: 'dpo-test',
      recordsPurgedCount: 1,
      recordIdsPurged,
      sessionsPurgedCount: 1,
      audioShardsPurgedCount: 2,
      purgeReason: PurgeReason.PATIENT_REQUEST_ART_18,
      purgeMethod: PurgeMethod.CRYPTO_SHREDDING_NIST_800_88,
      status: PurgeStatus.PURGED_CONFIRMED,
      purgedAt,
      inactivityPeriodMonths: 65,
      canonicalProofHash,
      cryptographicPurgeSeal: encodePurgeSeal({
        certificateId,
        patientBlindIndex,
        canonicalProofHash,
        purgedAt,
        recordsPurgedCount: 1
      }),
      retentionPolicyCompliance: 'Conforme',
      verifierUrl: 'https://test.com'
    };

    // Adulteração maliciosa do número de registros purgados sem recalcular o hash
    const tamperedCert = {
      ...cert,
      recordsPurgedCount: 99
    };

    const verification = verifyPurgeCertificateIntegrity(tamperedCert);
    expect(verification.valid).toBe(false);
    expect(verification.status).toBe(PurgeProofVerificationStatus.PROOF_TAMPERED);
  });

  it('deve calcular corretamente a simulação de sanitização de mídia NIST SP 800-88', () => {
    const shredding = simulateCryptoShredding(5);
    expect(shredding.destroyedKeys).toBe(5);
    expect(shredding.shreddedBytes).toBe(5 * 4096);
    expect(shredding.sanitizationStandard).toContain('NIST SP 800-88');
  });
});
