import { describe, it, expect } from 'bun:test';
import {
  ConsentScope,
  ConsentStatus,
  ConsentLegalBasis
} from '@terapiainfoco/shared';
import {
  calculateConsentReceiptHash,
  encodeConsentToken,
  decodeConsentToken,
  verifyConsentReceiptIntegrity,
  evaluateProcessingPermission,
  formatConsentScopeLabel,
  getDefaultLegalBasisForScope
} from '../src/consentLedger';

describe('Consent Ledger & Granular Consent Engine (LGPD Art. 7/8/9/11/18 & CFP 006/2019)', () => {
  const samplePatientId = 'patient-uuid-1234';
  const sampleTimestamp = '2026-10-14T10:00:00.000Z';

  it('deve calcular hash canônico SHA-256 determinístico de 64 caracteres para recibo de consentimento', () => {
    const hash1 = calculateConsentReceiptHash({
      patientId: samplePatientId,
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
      action: 'GRANT',
      status: ConsentStatus.GRANTED,
      termVersion: 'v2.1',
      legalBasis: ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE,
      timestamp: sampleTimestamp,
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0 Test'
    });

    const hash2 = calculateConsentReceiptHash({
      patientId: samplePatientId,
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
      action: 'GRANT',
      status: ConsentStatus.GRANTED,
      termVersion: 'v2.1',
      legalBasis: ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE,
      timestamp: sampleTimestamp,
      ipAddress: '192.168.1.10',
      userAgent: 'Mozilla/5.0 Test'
    });

    expect(hash1).toBeString();
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('deve produzir hash diferente se qualquer atributo do consentimento for alterado', () => {
    const basePayload = {
      patientId: samplePatientId,
      scope: ConsentScope.TELECONSULTATION_AUDIO_RECORDING,
      action: 'GRANT' as const,
      status: ConsentStatus.GRANTED,
      termVersion: 'v2.1',
      legalBasis: ConsentLegalBasis.CFP_011_2018_TELEPSY,
      timestamp: sampleTimestamp
    };

    const hashOriginal = calculateConsentReceiptHash(basePayload);
    const hashModifiedScope = calculateConsentReceiptHash({
      ...basePayload,
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS
    });
    const hashRevocation = calculateConsentReceiptHash({
      ...basePayload,
      action: 'REVOKE',
      status: ConsentStatus.REVOKED,
      revocationReason: 'Paciente solicitou interrupção de gravações'
    });

    expect(hashOriginal).not.toBe(hashModifiedScope);
    expect(hashOriginal).not.toBe(hashRevocation);
  });

  it('deve codificar e decodificar token público tcle_v1_ sem perda de dados', () => {
    const receiptData = {
      receiptId: 'rcpt-550e8400-e29b-41d4-a716-446655440000',
      patientId: samplePatientId,
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
      action: 'GRANT' as const,
      receiptHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: sampleTimestamp
    };

    const token = encodeConsentToken(receiptData);
    expect(token.startsWith('tcle_v1_')).toBeTrue();

    const decoded = decodeConsentToken(token);
    expect(decoded.receiptId).toBe(receiptData.receiptId);
    expect(decoded.patientId).toBe(receiptData.patientId);
    expect(decoded.scope).toBe(receiptData.scope);
    expect(decoded.action).toBe(receiptData.action);
    expect(decoded.receiptHash).toBe(receiptData.receiptHash);
    expect(decoded.timestamp).toBe(receiptData.timestamp);
  });

  it('deve rejeitar decodificação de token sem prefixo tcle_v1_', () => {
    expect(() => decodeConsentToken('invalid_prefix_abc123')).toThrow('prefixo tcle_v1_');
  });

  it('deve validar integridade de recibo e detectar adulteração', () => {
    const receiptPayload = {
      receiptId: 'rcpt-1',
      patientId: samplePatientId,
      scope: ConsentScope.INTERPROFESSIONAL_SHARING,
      action: 'GRANT' as const,
      status: ConsentStatus.GRANTED,
      termVersion: 'v2.0',
      legalBasis: ConsentLegalBasis.CFP_006_2019_INTERPROFESSIONAL,
      timestamp: sampleTimestamp,
      verificationToken: 'tcle_v1_xyz'
    };

    const validHash = calculateConsentReceiptHash(receiptPayload);
    const validReceipt = { ...receiptPayload, receiptHash: validHash };

    expect(verifyConsentReceiptIntegrity(validReceipt)).toBeTrue();

    const tamperedReceipt = { ...validReceipt, receiptHash: '0000000000000000000000000000000000000000000000000000000000000000' };
    expect(verifyConsentReceiptIntegrity(tamperedReceipt)).toBeFalse();
  });

  it('deve autorizar processamento para escopo com status GRANTED', () => {
    const preference = {
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
      status: ConsentStatus.GRANTED,
      grantedAt: sampleTimestamp,
      termVersion: 'v2.1',
      receiptHash: 'abc-hash-123',
      legalBasis: ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE
    };

    const evaluation = evaluateProcessingPermission(preference, ConsentScope.AI_CLINICAL_SYNTHESIS);
    expect(evaluation.permitted).toBeTrue();
    expect(evaluation.status).toBe(ConsentStatus.GRANTED);
    expect(evaluation.reason).toContain('Tratamento autorizado');
  });

  it('deve bloquear processamento e fundamentar legalmente quando o consentimento foi REVOGADO (Smart Revocation)', () => {
    const preference = {
      scope: ConsentScope.AI_CLINICAL_SYNTHESIS,
      status: ConsentStatus.REVOKED,
      grantedAt: sampleTimestamp,
      revokedAt: '2026-10-14T11:00:00.000Z',
      termVersion: 'v2.1',
      receiptHash: 'abc-hash-123',
      revocationReason: 'Paciente optou por anotação manual exclusiva',
      legalBasis: ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE
    };

    const evaluation = evaluateProcessingPermission(preference, ConsentScope.AI_CLINICAL_SYNTHESIS);
    expect(evaluation.permitted).toBeFalse();
    expect(evaluation.status).toBe(ConsentStatus.REVOKED);
    expect(evaluation.reason).toContain('Tratamento bloqueado');
    expect(evaluation.reason).toContain('LGPD Art. 8º, §5º');
    expect(evaluation.reason).toContain('Paciente optou por anotação manual exclusiva');
  });

  it('deve bloquear processamento quando o escopo não está configurado ou foi recusado', () => {
    const evaluationMissing = evaluateProcessingPermission(undefined, ConsentScope.TELECONSULTATION_AUDIO_RECORDING);
    expect(evaluationMissing.permitted).toBeFalse();
    expect(evaluationMissing.reason).toContain('não configurado');

    const preferenceRefused = {
      scope: ConsentScope.ANONYMIZED_RESEARCH,
      status: ConsentStatus.REFUSED,
      termVersion: 'v2.1',
      receiptHash: 'refused-hash',
      legalBasis: ConsentLegalBasis.LGPD_ART_7_I_CONSENT
    };
    const evaluationRefused = evaluateProcessingPermission(preferenceRefused, ConsentScope.ANONYMIZED_RESEARCH);
    expect(evaluationRefused.permitted).toBeFalse();
    expect(evaluationRefused.status).toBe(ConsentStatus.REFUSED);
    expect(evaluationRefused.reason).toContain('recusado expressamente');
  });

  it('deve retornar rótulos legíveis e bases legais corretas para todos os escopos', () => {
    expect(formatConsentScopeLabel(ConsentScope.TELECONSULTATION_AUDIO_RECORDING)).toContain('CFP 011/2018');
    expect(formatConsentScopeLabel(ConsentScope.AI_CLINICAL_SYNTHESIS)).toContain('LGPD Art. 11');
    expect(formatConsentScopeLabel(ConsentScope.INTERPROFESSIONAL_SHARING)).toContain('CFP 006/2019');

    expect(getDefaultLegalBasisForScope(ConsentScope.TELECONSULTATION_AUDIO_RECORDING)).toBe(ConsentLegalBasis.CFP_011_2018_TELEPSY);
    expect(getDefaultLegalBasisForScope(ConsentScope.AI_CLINICAL_SYNTHESIS)).toBe(ConsentLegalBasis.LGPD_ART_11_I_SENSITIVE);
    expect(getDefaultLegalBasisForScope(ConsentScope.INTERPROFESSIONAL_SHARING)).toBe(ConsentLegalBasis.CFP_006_2019_INTERPROFESSIONAL);
  });
});
