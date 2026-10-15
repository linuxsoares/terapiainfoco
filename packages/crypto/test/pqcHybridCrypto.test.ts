import { describe, it, expect } from 'bun:test';
import {
  generateHybridKeyPair,
  encapsulateHybridKey,
  decapsulateHybridKey,
  signHybridDocument,
  verifyHybridSignature,
  createPqcProofSeal,
  verifyPqcProofSeal,
  protectClinicalRecordPqc,
  openClinicalRecordPqc,
  simulateQuantumAttack,
  deriveHybridSharedSecret,
  canonicalStringify,
  PQC_CLINICAL_PRESETS
} from '../src/pqcHybridCrypto';
import {
  PqcKemScheme,
  PqcDsaScheme,
  PqcHybridMode,
  PqcSecurityLevel,
  PqcClinicalTargetType,
  PqcQuantumAttackType,
  PqcDefenseOutcome
} from '@terapiainfoco/shared';

describe('Criptografia Pós-Quântica Híbrida (NIST FIPS 203 ML-KEM & FIPS 204 ML-DSA)', () => {
  it('deve gerar par de chaves híbrido válido (NIST Nível 3 - ML-KEM-768 + ML-DSA-65 + ECDH + ECDSA)', () => {
    const keyPair = generateHybridKeyPair({
      alias: 'Chave Clínica Consultório 1',
      securityLevel: PqcSecurityLevel.NIST_LEVEL_3
    });

    expect(keyPair.keyId).toBeDefined();
    expect(keyPair.alias).toBe('Chave Clínica Consultório 1');
    expect(keyPair.securityLevel).toBe(PqcSecurityLevel.NIST_LEVEL_3);
    expect(keyPair.kemScheme).toBe(PqcKemScheme.ML_KEM_768);
    expect(keyPair.dsaScheme).toBe(PqcDsaScheme.ML_DSA_65);

    // Chaves públicas
    expect(keyPair.publicKey.classicalPublicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.publicKey.classicalVerifyKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.publicKey.pqKemPublicKeyBase64.length).toBeGreaterThan(50);
    expect(keyPair.publicKey.pqDsaPublicKeyBase64.length).toBeGreaterThan(50);

    // Chaves privadas
    expect(keyPair.privateKey?.classicalPrivateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.privateKey?.classicalSignKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(keyPair.privateKey?.pqKemPrivateKeyBase64.length).toBeGreaterThan(50);
    expect(keyPair.privateKey?.pqDsaPrivateKeyBase64.length).toBeGreaterThan(50);
  });

  it('deve gerar par de chaves híbrido NIST Nível 5 (ML-KEM-1024 + ML-DSA-87)', () => {
    const keyPair = generateHybridKeyPair({
      securityLevel: PqcSecurityLevel.NIST_LEVEL_5
    });

    expect(keyPair.securityLevel).toBe(PqcSecurityLevel.NIST_LEVEL_5);
    expect(keyPair.kemScheme).toBe(PqcKemScheme.ML_KEM_1024);
    expect(keyPair.dsaScheme).toBe(PqcDsaScheme.ML_DSA_87);
  });

  it('deve encapsular e decapsular chave compartilhada híbrida derivando a mesma DEK de 256 bits', () => {
    const keyPair = generateHybridKeyPair();

    const { encapsulation, derivedSharedSecret } = encapsulateHybridKey(keyPair.publicKey);

    expect(encapsulation.keyId).toBe(keyPair.keyId);
    expect(encapsulation.classicalCiphertextPem).toContain('BEGIN PUBLIC KEY');
    expect(encapsulation.pqCiphertextBase64.length).toBeGreaterThan(20);
    expect(derivedSharedSecret.length).toBe(32); // 256 bits

    const recoveredSecret = decapsulateHybridKey(
      encapsulation,
      keyPair.privateKey!,
      keyPair.publicKey
    );

    expect(recoveredSecret.length).toBe(32);
    expect(recoveredSecret.toString('hex')).toBe(derivedSharedSecret.toString('hex'));
  });

  it('deve assinar e verificar documento clínico com Assinatura Dual Híbrida (ECDSA P-256 + ML-DSA)', () => {
    const keyPair = generateHybridKeyPair();
    const clinicalDocument = 'Evolução Psiquiátrica confidencial: Paciente em remissão completa dos sintomas de pânico.';

    const signature = signHybridDocument(clinicalDocument, keyPair.privateKey!, keyPair.dsaScheme);

    expect(signature.keyId).toBe(keyPair.keyId);
    expect(signature.classicalSignatureHex.length).toBeGreaterThan(30);
    expect(signature.pqSignatureBase64.length).toBeGreaterThan(30);

    const verification = verifyHybridSignature(clinicalDocument, signature, keyPair.publicKey);

    expect(verification.isValid).toBe(true);
    expect(verification.classicalSignatureValid).toBe(true);
    expect(verification.pqSignatureValid).toBe(true);
    expect(verification.hybridValid).toBe(true);
    expect(verification.message).toContain('Assinatura Dual PQC verificada com sucesso');
  });

  it('deve rejeitar assinatura dual se o texto clínico for adulterado', () => {
    const keyPair = generateHybridKeyPair();
    const originalText = 'Prescrição autorizada: Clonazepam 0.5mg à noite.';
    const tamperedText = 'Prescrição autorizada: Clonazepam 5.0mg à noite (adulterado).';

    const signature = signHybridDocument(originalText, keyPair.privateKey!);
    const verification = verifyHybridSignature(tamperedText, signature, keyPair.publicKey);

    expect(verification.isValid).toBe(false);
    expect(verification.hybridValid).toBe(false);
    expect(verification.message).toContain('Adulteração detectada');
  });

  it('deve emitir e validar selo probatório WORM HMAC-SHA256 com 100% de autenticidade', () => {
    const seal = createPqcProofSeal(
      'op_test_123',
      PqcClinicalTargetType.SOAP_EVOLUTION_RECORD,
      PqcHybridMode.HYBRID_PQC_CLASSICAL,
      { test: true }
    );

    expect(seal.sealToken).toStartWith('pqc_proof_v1_');
    expect(seal.canonicalDigest.length).toBe(64);
    expect(seal.hmacSignature.length).toBe(64);

    const verification = verifyPqcProofSeal(seal.sealToken);
    expect(verification.isValid).toBe(true);
    expect(verification.seal).toBeDefined();
    expect(verification.seal?.canonicalDigest).toBe(seal.canonicalDigest);
  });

  it('deve detectar violação e rejeitar selo WORM adulterado', () => {
    const seal = createPqcProofSeal(
      'op_tamper_test',
      PqcClinicalTargetType.TELEMEDICINE_AUDIO_RECORDING,
      PqcHybridMode.HYBRID_PQC_CLASSICAL,
      { patientId: 'p_1' }
    );

    // Adulteração no payload do token
    const base64Data = seal.sealToken.replace('pqc_proof_v1_', '');
    const decoded = JSON.parse(Buffer.from(base64Data, 'base64url').toString('utf8'));
    decoded.cd = '0000000000000000000000000000000000000000000000000000000000000000';
    const tamperedToken = `pqc_proof_v1_${Buffer.from(JSON.stringify(decoded)).toString('base64url')}`;

    const verification = verifyPqcProofSeal(tamperedToken);
    expect(verification.isValid).toBe(false);
    expect(verification.message).toContain('Assinatura HMAC do selo PQC violada');
  });

  it('deve proteger e decifrar ponta a ponta um registro clínico SOAP completo', () => {
    const keyPair = generateHybridKeyPair();
    const preset = PQC_CLINICAL_PRESETS[0];

    const protectedRecord = protectClinicalRecordPqc({
      targetType: preset.targetType,
      title: preset.title,
      patientBlindIndex: preset.patientBlindIndex,
      therapistId: preset.therapistId,
      plaintextClinicalData: preset.content,
      keyPair
    });

    expect(protectedRecord.id).toStartWith('pqc_rec_');
    expect(protectedRecord.ciphertextBase64).toBeDefined();
    expect(protectedRecord.ivHex.length).toBe(24);
    expect(protectedRecord.authTagHex.length).toBe(32);
    expect(protectedRecord.quantumSafe).toBe(true);
    expect(protectedRecord.proofSeal.sealToken).toStartWith('pqc_proof_v1_');

    // Abertura do prontuário
    const opened = openClinicalRecordPqc(
      protectedRecord,
      keyPair.privateKey!,
      keyPair.publicKey
    );

    expect(opened.plaintext).toBe(preset.content);
    expect(opened.signatureVerification.isValid).toBe(true);
    expect(opened.signatureVerification.hybridValid).toBe(true);
  });

  it('deve simular ataque de Shor comprovando a eficácia da proteção por reticulados ML-KEM', () => {
    const keyPair = generateHybridKeyPair();
    const preset = PQC_CLINICAL_PRESETS[1];

    const protectedRecord = protectClinicalRecordPqc({
      targetType: preset.targetType,
      title: preset.title,
      patientBlindIndex: preset.patientBlindIndex,
      therapistId: preset.therapistId,
      plaintextClinicalData: preset.content,
      keyPair
    });

    const sim = simulateQuantumAttack(
      protectedRecord,
      PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG,
      keyPair
    );

    expect(sim.attackType).toBe(PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG);
    expect(sim.classicalCracked).toBe(true);
    expect(sim.postQuantumCracked).toBe(false);
    expect(sim.dataExfiltrated).toBe(false);
    expect(sim.outcome).toBe(PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE);
    expect(sim.explanation).toContain('Defesa PQC Bem-Sucedida');
    expect(sim.proofSeal.sealToken).toStartWith('pqc_proof_v1_');
  });

  it('deve simular ataque Store Now Decrypt Later (SNDL) com proteção atestada', () => {
    const keyPair = generateHybridKeyPair();
    const preset = PQC_CLINICAL_PRESETS[2];

    const protectedRecord = protectClinicalRecordPqc({
      targetType: preset.targetType,
      title: preset.title,
      patientBlindIndex: preset.patientBlindIndex,
      therapistId: preset.therapistId,
      plaintextClinicalData: preset.content,
      keyPair
    });

    const sim = simulateQuantumAttack(
      protectedRecord,
      PqcQuantumAttackType.STORE_NOW_DECRYPT_LATER_SNDL,
      keyPair
    );

    expect(sim.dataExfiltrated).toBe(false);
    expect(sim.outcome).toBe(PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE);
    expect(sim.explanation).toContain('Imunidade SNDL Atestada');
  });

  it('deve simular falsificação quântica de assinatura clássica demonstrando a contenção pelo ML-DSA', () => {
    const keyPair = generateHybridKeyPair();
    const preset = PQC_CLINICAL_PRESETS[3];

    const protectedRecord = protectClinicalRecordPqc({
      targetType: preset.targetType,
      title: preset.title,
      patientBlindIndex: preset.patientBlindIndex,
      therapistId: preset.therapistId,
      plaintextClinicalData: preset.content,
      keyPair
    });

    const sim = simulateQuantumAttack(
      protectedRecord,
      PqcQuantumAttackType.FORGED_CLASSICAL_SIGNATURE,
      keyPair
    );

    expect(sim.outcome).toBe(PqcDefenseOutcome.ATTACK_REPELLED);
    expect(sim.explanation).toContain('Fraude Documental Neutralizada');
  });

  it('deve comprovar vulnerabilidade se o registro for gerado exclusivamente em modo clássico', () => {
    const keyPair = generateHybridKeyPair();
    const preset = PQC_CLINICAL_PRESETS[0];

    // Modo legado puramente clássico
    const classicalRecord = protectClinicalRecordPqc({
      targetType: preset.targetType,
      title: preset.title,
      patientBlindIndex: preset.patientBlindIndex,
      therapistId: preset.therapistId,
      plaintextClinicalData: preset.content,
      keyPair,
      hybridMode: PqcHybridMode.CLASSICAL_COMPAT_ONLY
    });

    expect(classicalRecord.quantumSafe).toBe(false);

    const sim = simulateQuantumAttack(
      classicalRecord,
      PqcQuantumAttackType.SHORS_ALGORITHM_DISCRETE_LOG,
      keyPair
    );

    expect(sim.dataExfiltrated).toBe(true);
    expect(sim.outcome).toBe(PqcDefenseOutcome.CRACKED_CLASSICAL_ONLY);
    expect(sim.explanation).toContain('Vulnerabilidade Crítica');
  });
});
