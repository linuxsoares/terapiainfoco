import { describe, it, expect } from 'bun:test';
import {
  PortabilityKdfAlgorithm,
  PortabilitySectionType
} from '@terapiainfoco/shared';
import type { ConsolidatedPortabilityPayload } from '@terapiainfoco/shared';
import {
  buildPortabilitySectionDigests,
  canonicalizePortabilityJson,
  computePortabilityMerkleRoot,
  createEncryptedPortabilityVault,
  decryptEncryptedPortabilityVault,
  extractPatientInitials,
  issuePortabilityNotarySeal,
  sha256Hex,
  verifyEncryptedPortabilityVault,
  verifyPortabilityNotarySeal
} from '../src/encryptedPortabilityVault';

function createSampleConsolidatedPayload(): ConsolidatedPortabilityPayload {
  const patientDemographics = {
    id: 'patient-portability-001',
    name: 'Mariana Silva de Oliveira',
    email: 'mariana.silva@email.com',
    phone: '(11) 98765-4321',
    cpf: '123.456.789-00',
    consentTranscriptionSigned: true,
    createdAt: new Date().toISOString()
  };

  const anamnesisRecords = [{ id: 'anam-1', chiefComplaint: 'Ansiedade generalizada' }];
  const appointments = [{ id: 'appt-1', status: 'COMPLETED' }];
  const clinicalRecordsSoap = [
    {
      id: 'soap-1',
      sessionNumber: 1,
      subjective: 'Relato de melhora progressiva.',
      isSigned: true
    }
  ];
  const psychometricAssessments = [{ id: 'psy-1', scaleType: 'PHQ9', totalScore: 9 }];
  const diagnosticDecisionReports = [{ id: 'diag-1', primaryTrack: 'ANXIETY_SPECTRUM' }];
  const therapeuticGoalsSmart = [{ id: 'goal-1', title: 'Regulação autonômica', progressPercent: 80 }];
  const portalExercises = [{ id: 'ex-1', type: 'RPD_THOUGHT_RECORD', status: 'REVIEWED' }];
  const psychologicalDocuments = [{ id: 'doc-1', type: 'RELATORIO', isSigned: true }];
  const psychiatricReferrals = [{ id: 'ref-1', urgencyLevel: 'ROUTINE' }];
  const billingReceiptsDmed = [{ id: 'rec-1', receiptNumber: 'REC-2026-0001', amountCents: 25000 }];

  const sectionDigests = buildPortabilitySectionDigests({
    patientDemographics,
    anamnesisRecords,
    appointments,
    clinicalRecordsSoap,
    psychometricAssessments,
    diagnosticDecisionReports,
    therapeuticGoalsSmart,
    portalExercises,
    psychologicalDocuments,
    psychiatricReferrals,
    billingReceiptsDmed
  });

  const merkleRootSha256 = computePortabilityMerkleRoot(sectionDigests);

  const coreWithoutHash = {
    schemaVersion: '2.0.0-RFC001' as const,
    exportedAt: new Date().toISOString(),
    requestReason: 'Solicitação de portabilidade integral LGPD Art. 18, V',
    regulationCompliance: {
      lgpdArticles: ['Art. 18, II', 'Art. 18, V', 'Art. 16, I'],
      cfpResolutions: ['Resolução CFP nº 001/2009', 'Resolução CFP nº 006/2019'],
      retentionGuaranteeYears: 5,
      holderAutonomyStatement: 'Direito à autodeterminação informativa e portabilidade clínica.'
    },
    therapist: {
      id: 'therapist-001',
      name: 'Dra. Beatriz Santos',
      crp: '06/142980',
      crpRegion: 'SP'
    },
    patientDemographics,
    anamnesisRecords,
    appointments,
    clinicalRecordsSoap,
    psychometricAssessments,
    diagnosticDecisionReports,
    therapeuticGoalsSmart,
    portalExercises,
    psychologicalDocuments,
    psychiatricReferrals,
    billingReceiptsDmed,
    sectionDigests,
    merkleRootSha256
  };

  const canonicalSha256 = sha256Hex(canonicalizePortabilityJson(coreWithoutHash));

  return {
    ...coreWithoutHash,
    canonicalSha256
  };
}

describe('EncryptedPortabilityVault Engine (.enc Argon2id + AES-256-GCM + Merkle Root)', () => {
  it('1. deve construir os 11 digests de seções clínicas e calcular a Raiz de Merkle determinística', () => {
    const payload = createSampleConsolidatedPayload();
    expect(payload.sectionDigests).toHaveLength(11);
    expect(payload.sectionDigests[0].section).toBe(PortabilitySectionType.PATIENT_DEMOGRAPHICS);
    expect(payload.merkleRootSha256).toHaveLength(64);
    expect(payload.canonicalSha256).toHaveLength(64);
  });

  it('2. deve extrair iniciais anonimizadas do paciente com K-Anonymity para o cabeçalho externo .enc', () => {
    expect(extractPatientInitials('Mariana Silva de Oliveira')).toBe('M. S. D. O.');
  });

  it('3. deve gerar pacote .enc com Argon2id + AES-256-GCM + AAD e verificar integridade com 100% de sucesso', () => {
    const payload = createSampleConsolidatedPayload();
    const passphrase = 'SenhaTitularForte#2026!';

    const encFile = createEncryptedPortabilityVault({
      payload,
      holderPassphrase: passphrase,
      kdfAlgorithm: PortabilityKdfAlgorithm.ARGON2ID
    });

    expect(encFile.fileHeader).toBe('TERAPIAINFOCO-PORTABILITY-VAULT-V2');
    expect(encFile.fileExtension).toBe('.enc');
    expect(encFile.cipherAlgorithm).toBe('aes-256-gcm');
    expect(encFile.kdfAlgorithm).toBe(PortabilityKdfAlgorithm.ARGON2ID);
    expect(encFile.notarySeal.sealToken.startsWith('port_enc_seal_v1_')).toBe(true);

    const verification = verifyEncryptedPortabilityVault(encFile, passphrase);
    expect(verification.isValid).toBe(true);
    expect(verification.headerValid).toBe(true);
    expect(verification.ciphertextHashMatch).toBe(true);
    expect(verification.merkleRootMatch).toBe(true);
    expect(verification.notarySealValid).toBe(true);
    expect(verification.passphraseVerified).toBe(true);
  });

  it('4. deve decifrar o pacote .enc e restaurar exatamente o prontuário consolidado original', () => {
    const payload = createSampleConsolidatedPayload();
    const passphrase = 'ChaveSecretaPortabilidade#99';

    const encFile = createEncryptedPortabilityVault({
      payload,
      holderPassphrase: passphrase,
      kdfAlgorithm: PortabilityKdfAlgorithm.ARGON2ID
    });

    const decrypted = decryptEncryptedPortabilityVault(encFile, passphrase);
    expect(decrypted.patientDemographics.name).toBe('Mariana Silva de Oliveira');
    expect(decrypted.merkleRootSha256).toBe(payload.merkleRootSha256);
    expect(decrypted.canonicalSha256).toBe(payload.canonicalSha256);
    expect(decrypted.billingReceiptsDmed).toHaveLength(1);
    expect(decrypted.psychiatricReferrals).toHaveLength(1);
  });

  it('5. deve rejeitar senha incorreta na decifragem e na verificação autenticada', () => {
    const payload = createSampleConsolidatedPayload();
    const encFile = createEncryptedPortabilityVault({
      payload,
      holderPassphrase: 'SenhaCorreta#2026'
    });

    const verifyWrong = verifyEncryptedPortabilityVault(encFile, 'SenhaIncorreta#0000');
    expect(verifyWrong.isValid).toBe(false);
    expect(verifyWrong.passphraseVerified).toBe(false);

    expect(() =>
      decryptEncryptedPortabilityVault(encFile, 'SenhaIncorreta#0000')
    ).toThrow();
  });

  it('6. deve detectar adulteração de ciphertext ou selo notarial WORM', () => {
    const payload = createSampleConsolidatedPayload();
    const encFile = createEncryptedPortabilityVault({
      payload,
      holderPassphrase: 'SenhaIntegridade#2026'
    });

    const tampered = {
      ...encFile,
      ciphertextBase64: encFile.ciphertextBase64.slice(0, -4) + 'AAAA'
    };

    const verification = verifyEncryptedPortabilityVault(tampered);
    expect(verification.isValid).toBe(false);
    expect(verification.ciphertextHashMatch).toBe(false);
  });

  it('7. deve suportar PBKDF2_SHA512 como KDF alternativo compatível com FIPS', () => {
    const payload = createSampleConsolidatedPayload();
    const encFile = createEncryptedPortabilityVault({
      payload,
      holderPassphrase: 'SenhaFipsCompat#2026',
      kdfAlgorithm: PortabilityKdfAlgorithm.PBKDF2_SHA512
    });

    expect(encFile.kdfAlgorithm).toBe(PortabilityKdfAlgorithm.PBKDF2_SHA512);
    const decrypted = decryptEncryptedPortabilityVault(encFile, 'SenhaFipsCompat#2026');
    expect(decrypted.patientDemographics.id).toBe('patient-portability-001');
  });

  it('8. deve validar e rejeitar selos notariais adulterados em tempo constante', () => {
    const seal = issuePortabilityNotarySeal({
      patientId: 'p-1',
      therapistCrp: '06/142980',
      merkleRootSha256: 'a'.repeat(64),
      plaintextCanonicalSha256: 'b'.repeat(64),
      ciphertextSha256: 'c'.repeat(64),
      kdfAlgorithm: PortabilityKdfAlgorithm.ARGON2ID
    });

    expect(verifyPortabilityNotarySeal(seal)).toBe(true);
    expect(
      verifyPortabilityNotarySeal({ ...seal, merkleRootSha256: 'f'.repeat(64) })
    ).toBe(false);
  });
});
