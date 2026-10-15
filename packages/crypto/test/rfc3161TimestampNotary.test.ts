import { describe, expect, it } from 'bun:test';
import {
  OID_SHA256,
  OID_ICP_BRASIL_TSA_POLICY,
  TSA_TOKEN_PREFIX,
  canonicalStringify,
  createClinicalSessionImprint,
  createTimestampRequest,
  issueTimestampToken,
  parseTimestampToken,
  verifyTimestampToken,
  simulateTimestampTampering,
  DEFAULT_ICP_BRASIL_ACT_CERT
} from '../src/rfc3161TimestampNotary';
import {
  TsaAuthorityType,
  TimestampVerificationStatus,
  TimestampTamperType
} from '@terapiainfoco/shared';

describe('Módulo de Certificação Notarial de Sessão Clínica — RFC 3161 & ICP-Brasil TSA', () => {
  const mockSessionData = {
    sessionId: 'sess_clinical_2026_9871',
    patientBlindIndex: 'bidx_pat_7a8b9c0d1e2f3a4b',
    therapistId: 'therapist_dr_claudio_01',
    therapistCrp: 'CRP-06/123456',
    sessionStartTime: '2026-10-15T14:00:00.000Z',
    sessionEndTime: '2026-10-15T14:50:00.000Z',
    clinicalSummaryOrHash: 'sha256_soap_rectification_notary_anchor_2026'
  };

  it('canonicalStringify deve serializar propriedades de forma determinística independente da ordem', () => {
    const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };
    expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
  });

  it('createClinicalSessionImprint deve gerar digest canônico SHA-256 com OID oficial', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    expect(imprint.hashAlgorithm).toBe('sha256');
    expect(imprint.hashAlgorithmOid).toBe(OID_SHA256);
    expect(imprint.hashedMessage).toHaveLength(64);

    // Determinismo
    const imprint2 = createClinicalSessionImprint({ ...mockSessionData });
    expect(imprint.hashedMessage).toBe(imprint2.hashedMessage);

    // Mudança no horário altera o hash
    const imprintDiff = createClinicalSessionImprint({
      ...mockSessionData,
      sessionEndTime: '2026-10-15T14:55:00.000Z'
    });
    expect(imprint.hashedMessage).not.toBe(imprintDiff.hashedMessage);
  });

  it('createTimestampRequest deve gerar requisição RFC 3161 v1 com nonce criptográfico e política ICP-Brasil', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });

    expect(req.version).toBe(1);
    expect(req.reqPolicyOid).toBe(OID_ICP_BRASIL_TSA_POLICY);
    expect(req.nonce).toBeTruthy();
    expect(req.nonce.length).toBeGreaterThanOrEqual(16);
    expect(req.certReq).toBe(true);
    expect(req.messageImprint.hashedMessage).toBe(imprint.hashedMessage);
  });

  it('issueTimestampToken deve emitir token válido assinado pela ACT ICP-Brasil com TSTInfo e WORM digest', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });

    const token = issueTimestampToken(req);

    expect(token.tokenId.startsWith('tst_rfc3161_')).toBe(true);
    expect(token.rawTokenBase64.startsWith(TSA_TOKEN_PREFIX)).toBe(true);
    expect(token.status.code).toBe(0);
    expect(token.tsaCertificate.authorityType).toBe(TsaAuthorityType.ICP_BRASIL_ACT);
    expect(token.tstInfo.messageImprint.hashedMessage).toBe(imprint.hashedMessage);
    expect(token.tstInfo.nonce).toBe(req.nonce);
    expect(token.wormSealHash).toHaveLength(64);
  });

  it('parseTimestampToken deve decodificar perfeitamente o token base64url', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });
    const token = issueTimestampToken(req);

    const parsed = parseTimestampToken(token.rawTokenBase64);
    expect(parsed.tstInfo.serialNumber).toBe(token.tstInfo.serialNumber);
    expect(parsed.signature).toBe(token.signature);
  });

  it('verifyTimestampToken deve validar com 100% de sucesso um token legítimo', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });
    const token = issueTimestampToken(req);

    const verification = verifyTimestampToken({
      token,
      expectedImprint: imprint.hashedMessage,
      originalNonce: req.nonce
    });

    expect(verification.isValid).toBe(true);
    expect(verification.status).toBe(TimestampVerificationStatus.VALID);
    expect(verification.messageImprintMatch).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.nonceMatch).toBe(true);
    expect(verification.certificateValid).toBe(true);
  });

  it('verifyTimestampToken deve rejeitar verificação quando o MessageImprint for divergente (adulteração dos dados clínicos)', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });
    const token = issueTimestampToken(req);

    const falseImprint = '0000000000000000000000000000000000000000000000000000000000000000';
    const verification = verifyTimestampToken({
      token,
      expectedImprint: falseImprint,
      originalNonce: req.nonce
    });

    expect(verification.isValid).toBe(false);
    expect(verification.status).toBe(TimestampVerificationStatus.HASH_MISMATCH);
    expect(verification.messageImprintMatch).toBe(false);
  });

  it('verifyTimestampToken deve rejeitar quando o nonce do desafio for diferente (tentativa de replay)', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });
    const token = issueTimestampToken(req);

    const verification = verifyTimestampToken({
      token,
      expectedImprint: imprint.hashedMessage,
      originalNonce: 'replay_nonce_attack_999'
    });

    expect(verification.isValid).toBe(false);
    expect(verification.status).toBe(TimestampVerificationStatus.NONCE_MISMATCH);
    expect(verification.nonceMatch).toBe(false);
  });

  it('verifyTimestampToken deve rejeitar se o certificado da TSA estiver expirado na data do carimbo', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });

    const expiredCert = {
      ...DEFAULT_ICP_BRASIL_ACT_CERT,
      validFrom: '2020-01-01T00:00:00.000Z',
      validTo: '2021-01-01T00:00:00.000Z'
    };

    const token = issueTimestampToken(req, {
      tsaCert: expiredCert,
      forcedGenTime: '2026-10-15T14:30:00.000Z'
    });

    const verification = verifyTimestampToken({
      token,
      tsaCert: expiredCert
    });

    expect(verification.isValid).toBe(false);
    expect(verification.status).toBe(TimestampVerificationStatus.EXPIRED_TSA_CERTIFICATE);
    expect(verification.certificateValid).toBe(false);
  });

  it('simulateTimestampTampering deve permitir simulação de fraude e ser detectado pela verificação pericial', () => {
    const imprint = createClinicalSessionImprint(mockSessionData);
    const req = createTimestampRequest({
      sessionId: mockSessionData.sessionId,
      patientBlindIndex: mockSessionData.patientBlindIndex,
      therapistId: mockSessionData.therapistId,
      therapistCrp: mockSessionData.therapistCrp,
      messageImprint: imprint
    });
    const token = issueTimestampToken(req);

    // 1. Simular adulteração de data (retrodatação fraudulenta)
    const tamperedTimeToken = simulateTimestampTampering(token, TimestampTamperType.ALTER_TIMESTAMP);
    const checkTamperedTime = verifyTimestampToken({ token: tamperedTimeToken });
    expect(checkTamperedTime.isValid).toBe(false);
    expect(checkTamperedTime.status).toBe(TimestampVerificationStatus.SIGNATURE_INVALID);

    // 2. Simular adulteração do imprint (troca de prontuário)
    const tamperedImprintToken = simulateTimestampTampering(token, TimestampTamperType.CORRUPT_IMPRINT);
    const checkTamperedImprint = verifyTimestampToken({ token: tamperedImprintToken });
    expect(checkTamperedImprint.isValid).toBe(false);
    expect(checkTamperedImprint.status).toBe(TimestampVerificationStatus.SIGNATURE_INVALID);

    // 3. Simular forjação de assinatura da TSA
    const fakeSigToken = simulateTimestampTampering(token, TimestampTamperType.INVALID_SIGNATURE);
    const checkFakeSig = verifyTimestampToken({ token: fakeSigToken });
    expect(checkFakeSig.isValid).toBe(false);
    expect(checkFakeSig.status).toBe(TimestampVerificationStatus.SIGNATURE_INVALID);
  });
});
