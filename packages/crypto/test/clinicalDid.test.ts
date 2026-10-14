import { describe, it, expect } from 'bun:test';
import {
  formatTherapistDid,
  generateEphemeralDidKey,
  generateDidDocument,
  canonicalizeJson,
  calculateCredentialDigest,
  signVerifiableCredential,
  encodeCredentialJwt,
  decodeCredentialJwt,
  verifyVerifiableCredentialProof,
  createVerifiablePresentation,
  verifyVerifiablePresentation
} from '../src/clinicalDid';
import {
  VerifiableCredentialType,
  CredentialRevocationStatus,
  DidVerificationStatus
} from '@terapiainfoco/shared';

describe('W3C Decentralized Identifiers (DID) & Verifiable Credentials Engine (RFC-001 §3.5)', () => {
  it('deve formatar DID oficial do psicólogo no padrão did:terapiainfoco com sanitização de CRP', () => {
    const did1 = formatTherapistDid('123456', '06');
    expect(did1).toBe('did:terapiainfoco:crp-06-123456');

    // Com pontuação e caracteres não-numéricos
    const did2 = formatTherapistDid('CRP 06/98.765-X', '6');
    expect(did2).toBe('did:terapiainfoco:crp-06-0698765');
  });

  it('deve gerar DID autocontido did:key multibase com par de chaves públicas e privadas', () => {
    const keyPair = generateEphemeralDidKey();
    expect(keyPair.did.startsWith('did:key:z')).toBe(true);
    expect(keyPair.publicKeyHex).toHaveLength(64);
    expect(keyPair.privateKeyHex).toHaveLength(64);
  });

  it('deve gerar DID Document compatível com W3C DID v1.0 e métodos de verificação', () => {
    const did = 'did:terapiainfoco:crp-06-123456';
    const didDoc = generateDidDocument(did);

    expect(didDoc.id).toBe(did);
    expect(didDoc['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(didDoc.verificationMethod).toHaveLength(1);
    expect(didDoc.verificationMethod[0].id).toBe(`${did}#key-1`);
    expect(didDoc.verificationMethod[0].controller).toBe(did);
    expect(didDoc.assertionMethod).toContain(`${did}#key-1`);
    expect(didDoc.active).toBe(true);
  });

  it('deve canonicalizar JSON determinísticamente segundo a RFC 8785 (JCS)', () => {
    const objA = { z: 1, a: 'terapia', m: { b: 2, a: 1 } };
    const objB = { m: { a: 1, b: 2 }, a: 'terapia', z: 1 };

    const canonA = canonicalizeJson(objA);
    const canonB = canonicalizeJson(objB);

    expect(canonA).toBe(canonB);
    expect(calculateCredentialDigest(objA)).toBe(calculateCredentialDigest(objB));
  });

  it('deve assinar e emitir uma Verifiable Credential clínica com Data Integrity Proof e VC-JWT', () => {
    const issuerDid = 'did:terapiainfoco:crp-06-123456';
    const vc = signVerifiableCredential({
      id: 'urn:uuid:cred-ref-001',
      type: ['VerifiableCredential', VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 90 * 86400000).toISOString(),
      credentialSubject: {
        id: 'urn:terapiainfoco:blind:patient-xyz-123',
        therapistCrp: '06/123456',
        therapistName: 'Dra. Helena Martins',
        patientBlindIndex: 'bindex_sha256_mock_abc',
        patientNameMasked: 'L. M. S.',
        targetSpecialistType: 'PSIQUIATRA',
        referralReason: 'Avaliação farmacoterápica para episódio depressivo maior moderado',
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019 Art. 4º'
      }
    });

    expect(vc.id).toBe('urn:uuid:cred-ref-001');
    expect(vc.type).toContain(VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL);
    expect(vc.proof).toBeDefined();
    expect(vc.proof.type).toBe('DataIntegrityProof');
    expect(vc.proof.verificationMethod).toBe(`${issuerDid}#key-1`);
    expect(vc.proof.proofValue).toBeDefined();
    expect(vc.jwtRepresentation).toBeDefined();
    expect(vc.jwtRepresentation?.split('.')).toHaveLength(3);
  });

  it('deve serializar e desserializar VC-JWT sem perda de integridade', () => {
    const issuerDid = 'did:terapiainfoco:crp-06-888888';
    const vc = signVerifiableCredential({
      id: 'urn:uuid:attestation-999',
      type: ['VerifiableCredential', VerifiableCredentialType.MENTAL_HEALTH_ATTESTATION_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: 'urn:terapiainfoco:blind:patient-777',
        therapistCrp: '06/888888',
        therapistName: 'Dr. Roberto Souza',
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019'
      }
    });

    const jwt = vc.jwtRepresentation!;
    const decoded = decodeCredentialJwt(jwt);

    expect(decoded.id).toBe('urn:uuid:attestation-999');
    expect(decoded.issuer).toBe(issuerDid);
    expect(decoded.credentialSubject.therapistName).toBe('Dr. Roberto Souza');
  });

  it('deve validar matematicamente uma credencial autêntica e detectar adulteração (anti-tampering)', () => {
    const issuerDid = 'did:terapiainfoco:crp-06-555555';
    const vc = signVerifiableCredential({
      id: 'urn:uuid:cred-tamper-check',
      type: ['VerifiableCredential', VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: 'urn:terapiainfoco:blind:p1',
        therapistCrp: '06/555555',
        therapistName: 'Dra. Carla Dias',
        referralReason: 'Encaminhamento original legítimo',
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019'
      }
    });

    // 1. Verificação de credencial íntegra
    const validResult = verifyVerifiableCredentialProof(vc);
    expect(validResult.valid).toBe(true);
    expect(validResult.status).toBe(DidVerificationStatus.VALID_VERIFIED);
    expect(validResult.tamperingDetected).toBe(false);

    // 2. Adulteração maliciosa do conteúdo (ataque man-in-the-middle)
    const tamperedVc = JSON.parse(JSON.stringify(vc));
    tamperedVc.credentialSubject.referralReason = 'Motivação forjada por invasor!';

    const tamperedResult = verifyVerifiableCredentialProof(tamperedVc);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.tamperingDetected).toBe(true);
    expect(tamperedResult.status).toBe(DidVerificationStatus.SIGNATURE_INVALID);
  });

  it('deve validar revogação e expiração de credencial verificável', () => {
    const issuerDid = 'did:terapiainfoco:crp-06-333333';
    
    // 1. Credencial expirada
    const expiredVc = signVerifiableCredential({
      id: 'urn:uuid:expired-01',
      type: ['VerifiableCredential', VerifiableCredentialType.PSYCHOLOGIST_LICENSE_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date('2020-01-01').toISOString(),
      expirationDate: new Date('2021-01-01').toISOString(),
      credentialSubject: {
        id: issuerDid,
        therapistCrp: '06/333333',
        therapistName: 'Psicólogo Habilitado',
        cfpResolutionCompliance: 'CFP e-Psi'
      }
    });

    const expResult = verifyVerifiableCredentialProof(expiredVc);
    expect(expResult.valid).toBe(false);
    expect(expResult.status).toBe(DidVerificationStatus.CREDENTIAL_EXPIRED);

    // 2. Credencial revogada
    const activeVc = signVerifiableCredential({
      id: 'urn:uuid:revoked-01',
      type: ['VerifiableCredential', VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: 'urn:terapiainfoco:blind:p2',
        therapistCrp: '06/333333',
        therapistName: 'Psicólogo Habilitado',
        cfpResolutionCompliance: 'CFP e-Psi'
      }
    });

    const revokedResult = verifyVerifiableCredentialProof(activeVc, undefined, (id) => id === 'urn:uuid:revoked-01');
    expect(revokedResult.valid).toBe(false);
    expect(revokedResult.status).toBe(DidVerificationStatus.CREDENTIAL_REVOKED);
  });

  it('deve criar e validar uma Apresentação Verificável (VP) com nonce anti-replay', () => {
    const issuerDid = 'did:terapiainfoco:crp-06-111111';
    const holderDid = 'did:key:zPatientHolderKey123';
    const nonce = 'auth-challenge-nonce-xyz-987';

    const vc = signVerifiableCredential({
      id: 'urn:uuid:vp-cred-01',
      type: ['VerifiableCredential', VerifiableCredentialType.CLINICAL_REFERRAL_CREDENTIAL],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: holderDid,
        therapistCrp: '06/111111',
        therapistName: 'Dr. Lucas Prado',
        cfpResolutionCompliance: 'Resolução CFP nº 006/2019'
      }
    });

    const vp = createVerifiablePresentation([vc], holderDid, undefined, nonce);
    expect(vp.type).toContain('VerifiablePresentation');
    expect(vp.holder).toBe(holderDid);
    expect(vp.verifiableCredential).toHaveLength(1);

    // Validação com nonce correto
    const vpValidation = verifyVerifiablePresentation(vp, nonce);
    expect(vpValidation.valid).toBe(true);

    // Rejeição com nonce adulterado
    const invalidNonceValidation = verifyVerifiablePresentation(vp, 'wrong-nonce-replay');
    expect(invalidNonceValidation.valid).toBe(false);
  });
});
