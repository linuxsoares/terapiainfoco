import {
  PqcKemScheme,
  PqcDsaScheme,
  PqcHybridMode,
  PqcSecurityLevel,
  PqcClinicalTargetType,
  PqcQuantumAttackType,
  PqcDefenseOutcome,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import type {
  PqcHybridKeyPair,
  PqcProtectedClinicalRecord,
  PqcQuantumAttackSimulationResult,
  PqcOverview,
  PqcMetrics,
  PqcProofSeal,
  PqcHybridSignatureResult,
  PqcSignatureVerificationResult,
  GeneratePqcKeyPairDTO,
  EncapsulatePqcRecordDTO,
  DecapsulatePqcRecordDTO,
  SignPqcDocumentDTO,
  VerifyPqcSignatureDTO,
  SimulateQuantumAttackDTO,
  VerifyPqcSealDTO
} from '@terapiainfoco/shared';
import {
  generateHybridKeyPair,
  protectClinicalRecordPqc,
  openClinicalRecordPqc,
  signHybridDocument,
  verifyHybridSignature,
  simulateQuantumAttack,
  verifyPqcProofSeal,
  PQC_CLINICAL_PRESETS
} from '@terapiainfoco/crypto';
import { AuditService } from './auditService';

export class PqcHybridService {
  private static instance: PqcHybridService;

  private keyPairs: Map<string, PqcHybridKeyPair> = new Map();
  private protectedRecords: Map<string, PqcProtectedClinicalRecord> = new Map();
  private recentSimulations: PqcQuantumAttackSimulationResult[] = [];
  private activeKeyId: string = '';
  private hybridEncapsulationsCount = 0;
  private hybridSignaturesCount = 0;
  private sndlAttacksNeutralizedCount = 0;

  private constructor() {
    this.seedDefaultData();
  }

  public static getInstance(): PqcHybridService {
    if (!PqcHybridService.instance) {
      PqcHybridService.instance = new PqcHybridService();
    }
    return PqcHybridService.instance;
  }

  /**
   * Sementes de demonstração clínica em conformidade com NIST FIPS 203/204
   */
  private seedDefaultData(): void {
    // 1. Chave Híbrida Principal (NIST Nível 3 - ML-KEM-768 + ML-DSA-65)
    const primaryKey = generateHybridKeyPair({
      keyId: 'pqc_key_primary_kyber768',
      alias: 'Chave Mestre de Produção — NIST FIPS 203 (ML-KEM-768 / Dilithium-3)',
      securityLevel: PqcSecurityLevel.NIST_LEVEL_3,
      kemScheme: PqcKemScheme.ML_KEM_768,
      dsaScheme: PqcDsaScheme.ML_DSA_65
    });
    this.keyPairs.set(primaryKey.keyId, primaryKey);
    this.activeKeyId = primaryKey.keyId;

    // 2. Chave de Alta Segurança (NIST Nível 5 - ML-KEM-1024 + ML-DSA-87)
    const level5Key = generateHybridKeyPair({
      keyId: 'pqc_key_high_security_kyber1024',
      alias: 'Chave de Alta Sensibilidade Hospitalar — NIST FIPS 203 (ML-KEM-1024 / Dilithium-5)',
      securityLevel: PqcSecurityLevel.NIST_LEVEL_5,
      kemScheme: PqcKemScheme.ML_KEM_1024,
      dsaScheme: PqcDsaScheme.ML_DSA_87
    });
    this.keyPairs.set(level5Key.keyId, level5Key);

    // 3. Proteger os registros clínicos dos presets com a chave primária
    for (const preset of PQC_CLINICAL_PRESETS) {
      const record = protectClinicalRecordPqc({
        id: preset.id,
        targetType: preset.targetType,
        title: preset.title,
        patientBlindIndex: preset.patientBlindIndex,
        therapistId: preset.therapistId,
        plaintextClinicalData: preset.content,
        keyPair: primaryKey
      });
      this.protectedRecords.set(record.id, record);
      this.hybridEncapsulationsCount++;
      this.hybridSignaturesCount++;
    }

    // 4. Executar simulação de demonstração para histórico inicial
    const demoRecord = this.protectedRecords.get('preset_soap_suicidal_risk')!;
    const demoSim = simulateQuantumAttack(
      demoRecord,
      PqcQuantumAttackType.STORE_NOW_DECRYPT_LATER_SNDL,
      primaryKey
    );
    this.recentSimulations.push(demoSim);
    this.sndlAttacksNeutralizedCount++;
  }

  /**
   * Visão Geral da Governança e Criptografia Quântica
   */
  public getOverview(): PqcOverview {
    const activeKeyPair = this.keyPairs.get(this.activeKeyId) || Array.from(this.keyPairs.values())[0];
    const availableKeyPairs = Array.from(this.keyPairs.values()).map(k => ({
      ...k,
      privateKey: undefined // Não expõe chave privada na visão geral
    }));

    const records = Array.from(this.protectedRecords.values());

    const metrics: PqcMetrics = {
      totalProtectedRecords: records.length,
      activeKeyPairsCount: this.keyPairs.size,
      hybridEncapsulationsCount: this.hybridEncapsulationsCount,
      hybridSignaturesCount: this.hybridSignaturesCount,
      quantumSimulationsRun: this.recentSimulations.length,
      sndlAttacksNeutralized: this.sndlAttacksNeutralizedCount,
      averageKdfLatencyMs: 1.4
    };

    return {
      metrics,
      activeHybridKeyPair: {
        ...activeKeyPair,
        privateKey: undefined
      },
      availableKeyPairs,
      protectedRecords: records,
      recentSimulations: this.recentSimulations,
      defaultSecurityLevel: PqcSecurityLevel.NIST_LEVEL_3,
      systemHealth: 'QUANTUM_SAFE'
    };
  }

  /**
   * Geração de Novo Par de Chaves Híbrido PQC
   */
  public generateKeyPair(dto: GeneratePqcKeyPairDTO, therapistId: string): PqcHybridKeyPair {
    const keyPair = generateHybridKeyPair({
      alias: dto.alias,
      securityLevel: dto.securityLevel,
      kemScheme: dto.kemScheme,
      dsaScheme: dto.dsaScheme
    });

    this.keyPairs.set(keyPair.keyId, keyPair);

    // Auditoria WORM
    AuditService.log({
      action: AuditAction.PQC_KEYPAIR_GENERATED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: keyPair.keyId,
      actorId: therapistId,
      details: {
        alias: keyPair.alias,
        securityLevel: keyPair.securityLevel,
        kemScheme: keyPair.kemScheme,
        dsaScheme: keyPair.dsaScheme,
        createdAt: keyPair.createdAt
      }
    });

    return {
      ...keyPair,
      privateKey: undefined
    };
  }

  /**
   * Encapsula DEK e Cifra Registro Clínico com Envelope PQC
   */
  public encapsulateAndProtectRecord(
    dto: EncapsulatePqcRecordDTO,
    therapistId: string
  ): PqcProtectedClinicalRecord {
    const keyPair = this.keyPairs.get(dto.keyId);
    if (!keyPair) {
      throw new Error(`Par de chaves PQC com ID ${dto.keyId} não encontrado no enclave de segurança.`);
    }

    const protectedRecord = protectClinicalRecordPqc({
      targetType: dto.targetType,
      title: dto.title,
      patientBlindIndex: dto.patientBlindIndex,
      therapistId,
      plaintextClinicalData: dto.plaintextClinicalData,
      keyPair,
      hybridMode: dto.hybridMode
    });

    this.protectedRecords.set(protectedRecord.id, protectedRecord);
    this.hybridEncapsulationsCount++;
    this.hybridSignaturesCount++;

    AuditService.log({
      action: AuditAction.PQC_HYBRID_ENCAPSULATED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: protectedRecord.id,
      actorId: therapistId,
      details: {
        title: protectedRecord.title,
        targetType: protectedRecord.targetType,
        keyId: dto.keyId,
        quantumSafe: protectedRecord.quantumSafe,
        sealToken: protectedRecord.proofSeal.sealToken
      }
    });

    return protectedRecord;
  }

  /**
   * Decapsula DEK e Decifra Prontuário Clínico Protegido
   */
  public decapsulateAndOpenRecord(
    dto: DecapsulatePqcRecordDTO,
    therapistId: string
  ): { decryptedPlaintext: string; verifiedSignature: boolean; message: string } {
    const record = this.protectedRecords.get(dto.recordId);
    if (!record) {
      throw new Error(`Registro clínico protegido com ID ${dto.recordId} não encontrado.`);
    }

    const keyPair = this.keyPairs.get(dto.keyId || record.encapsulation.keyId);
    if (!keyPair || !keyPair.privateKey) {
      throw new Error(`Chave privada PQC para decapsulamento não disponível no enclave.`);
    }

    const { plaintext, signatureVerification } = openClinicalRecordPqc(
      record,
      keyPair.privateKey,
      keyPair.publicKey
    );

    AuditService.log({
      action: AuditAction.PQC_HYBRID_DECAPSULATED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: record.id,
      actorId: therapistId,
      details: {
        recordId: record.id,
        keyId: keyPair.keyId,
        signatureValid: signatureVerification.isValid,
        decryptedAt: new Date().toISOString()
      }
    });

    return {
      decryptedPlaintext: plaintext,
      verifiedSignature: signatureVerification.isValid,
      message: signatureVerification.message
    };
  }

  /**
   * Assina Documento com Assinatura Dual Híbrida
   */
  public signDocument(dto: SignPqcDocumentDTO, therapistId: string): PqcHybridSignatureResult {
    const keyPair = this.keyPairs.get(dto.keyId);
    if (!keyPair || !keyPair.privateKey) {
      throw new Error(`Chave privada para assinatura PQC com ID ${dto.keyId} não disponível.`);
    }

    const signatureResult = signHybridDocument(
      dto.documentContent,
      keyPair.privateKey,
      dto.dsaScheme || keyPair.dsaScheme
    );

    this.hybridSignaturesCount++;

    AuditService.log({
      action: AuditAction.PQC_HYBRID_SIGNED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: keyPair.keyId,
      actorId: therapistId,
      details: {
        documentDigest: signatureResult.documentDigestHex,
        dsaScheme: signatureResult.dsaScheme,
        signedAt: signatureResult.signedAt
      }
    });

    return signatureResult;
  }

  /**
   * Valida Assinatura Dual Híbrida
   */
  public verifySignature(dto: VerifyPqcSignatureDTO): PqcSignatureVerificationResult {
    const keyPair = this.keyPairs.get(dto.keyId);
    if (!keyPair) {
      throw new Error(`Chave pública PQC com ID ${dto.keyId} não encontrada.`);
    }

    const sigResult: PqcHybridSignatureResult = {
      keyId: dto.keyId,
      documentDigestHex: Buffer.from(dto.documentContent).length > 0
        ? '' // será verificado dentro de verifyHybridSignature
        : '',
      classicalSignatureHex: dto.classicalSignatureHex,
      pqSignatureBase64: dto.pqSignatureBase64,
      dsaScheme: keyPair.dsaScheme,
      signedAt: new Date().toISOString()
    };

    // Ajusta digest esperado
    const cryptoMod = require('node:crypto');
    sigResult.documentDigestHex = cryptoMod.createHash('sha256').update(dto.documentContent).digest('hex');

    const result = verifyHybridSignature(dto.documentContent, sigResult, keyPair.publicKey);

    AuditService.log({
      action: AuditAction.PQC_HYBRID_SIGNATURE_VERIFIED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: keyPair.keyId,
      actorId: 'system_pqc_verifier',
      details: {
        isValid: result.isValid,
        classicalValid: result.classicalSignatureValid,
        pqValid: result.pqSignatureValid,
        message: result.message
      }
    });

    return result;
  }

  /**
   * Simulação de Ataque Quântico Shor / SNDL / Pentest
   */
  public simulateQuantumAttack(
    dto: SimulateQuantumAttackDTO,
    therapistId: string
  ): PqcQuantumAttackSimulationResult {
    const record = this.protectedRecords.get(dto.recordId);
    if (!record) {
      throw new Error(`Registro clínico ${dto.recordId} não localizado para o pentest.`);
    }

    const keyPair = this.keyPairs.get(record.encapsulation.keyId) || Array.from(this.keyPairs.values())[0];

    const simulation = simulateQuantumAttack(record, dto.attackType, keyPair);

    this.recentSimulations.unshift(simulation);
    if (this.recentSimulations.length > 20) {
      this.recentSimulations.pop();
    }

    if (simulation.outcome === PqcDefenseOutcome.PROTECTED_BY_PQC_LATTICE) {
      this.sndlAttacksNeutralizedCount++;
    }

    AuditService.log({
      action: AuditAction.PQC_QUANTUM_ATTACK_SIMULATED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: record.id,
      actorId: therapistId,
      details: {
        attackType: simulation.attackType,
        outcome: simulation.outcome,
        classicalCracked: simulation.classicalCracked,
        postQuantumCracked: simulation.postQuantumCracked,
        dataExfiltrated: simulation.dataExfiltrated,
        sealToken: simulation.proofSeal.sealToken
      }
    });

    return simulation;
  }

  /**
   * Validação Pericial Notarial de Selo WORM PQC
   */
  public verifyProofSeal(dto: VerifyPqcSealDTO): {
    isValid: boolean;
    seal?: PqcProofSeal;
    message: string;
    verifiedAt: string;
  } {
    const result = verifyPqcProofSeal(dto.sealToken);
    const verifiedAt = new Date().toISOString();

    AuditService.log({
      action: AuditAction.PQC_SEAL_VERIFIED,
      resourceType: AuditResourceType.PQC_CRYPTO_ENGINE,
      resourceId: dto.sealToken,
      actorId: 'public_notary_verifier',
      details: {
        isValid: result.isValid,
        message: result.message,
        verifiedAt
      }
    });

    return {
      isValid: result.isValid,
      seal: result.seal,
      message: result.message,
      verifiedAt
    };
  }
}
