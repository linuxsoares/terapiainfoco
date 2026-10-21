import {
  AuditAction,
  AuditResourceType,
  PortabilityKdfAlgorithm
} from '@terapiainfoco/shared';
import type {
  ConsolidatedPortabilityPayload,
  DecryptPortabilityEncVaultDTO,
  DecryptPortabilityEncVaultResponse,
  EncryptedPortabilityEncFile,
  GeneratePortabilityEncVaultDTO,
  GeneratePortabilityEncVaultResponse,
  PortabilityVaultHistoryResponse,
  VerifyPortabilityEncVaultDTO,
  VerifyPortabilityEncVaultResponse
} from '@terapiainfoco/shared';
import {
  buildPortabilitySectionDigests,
  canonicalizePortabilityJson,
  computePortabilityMerkleRoot,
  createEncryptedPortabilityVault,
  decryptEncryptedPortabilityVault,
  sha256Hex,
  verifyEncryptedPortabilityVault
} from '@terapiainfoco/crypto';
import { db } from '../db/memoryDb';
import { UserRepository } from '../repositories/userRepository';
import { decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
import { AppointmentRepository } from '../repositories/appointmentRepository';
import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
export class PortabilityVaultService {
  private static vaultHistory: Array<{
    vaultId: string;
    patientId: string;
    patientInitials: string;
    kdfAlgorithm: PortabilityKdfAlgorithm;
    merkleRootSha256: string;
    sealToken: string;
    totalRecordsCount: number;
    exportedAt: string;
  }> = [];

  /**
   * Consolida todas as 11 seções clínicas do paciente e gera o pacote .enc
   * protegido por Argon2id + AES-256-GCM com Merkle Root e Selo Notarial WORM
   */
  public static async generateEncryptedVault(params: {
    dto: GeneratePortabilityEncVaultDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<GeneratePortabilityEncVaultResponse> {
    const { dto, context } = params;
    const storedPatient = await PatientRepository.findById(dto.patientId);
    if (!storedPatient) {
      throw new Error('Paciente não encontrado para geração do cofre de portabilidade .enc.');
    }

    if (!dto.holderPassphrase || dto.holderPassphrase.trim().length < 8) {
      throw new Error(
        'A senha do titular para proteção do arquivo .enc deve ter pelo menos 8 caracteres (LGPD Art. 18).'
      );
    }

    let name = 'Paciente Titular';
    let email = 'paciente@terapiainfoco.local';
    let phone = '';
    let cpf: string | undefined;

    try {
      name = decryptField(storedPatient.encryptedName);
      email = decryptField(storedPatient.encryptedEmail);
      phone = decryptField(storedPatient.encryptedPhone);
      if (storedPatient.encryptedCpf) {
        cpf = decryptField(storedPatient.encryptedCpf);
      }
    } catch {
      name = '[DADOS EM QUARENTENA LGPD]';
    }

    const therapist = db.therapists.get(storedPatient.therapistId);
    let therapistName = 'Dra. Beatriz Santos';
    therapistName = (await UserRepository.findPracticeOwner(storedPatient.therapistId))?.name ?? therapistName;

    // 1. Dados Cadastrais & TCLE
    const patientDemographics = {
      id: storedPatient.id,
      name,
      email,
      phone,
      cpf,
      consentTranscriptionSigned: storedPatient.consentTranscriptionSigned,
      createdAt: new Date(storedPatient.createdAt).toISOString()
    };

    // 2. Anamnese Biopsicossocial
    const anamnesisRecords = Array.from(db.anamnesisRecords.values())
      .filter((a) => a.patientId === dto.patientId)
      .map((a) => {
        let chiefComplaint = '';
        let therapeuticGoals = '';
        try {
          chiefComplaint = decryptField(a.encryptedChiefComplaint);
          therapeuticGoals = decryptField(a.encryptedTherapeuticGoals);
        } catch {
          // fallback
        }
        return {
          id: a.id,
          version: a.version,
          chiefComplaint,
          therapeuticGoals,
          createdAt: new Date(a.createdAt).toISOString()
        };
      });

    // 3. Consultas & Teleconsultas
    const appointments = (await AppointmentRepository.list({ patientIds: [dto.patientId] }))
      .map((a) => ({
        id: a.id,
        scheduledStart: new Date(a.scheduledStart).toISOString(),
        scheduledEnd: new Date(a.scheduledEnd).toISOString(),
        status: a.status
      }));

    // 4. Prontuários SOAP (exceto notas estritamente privadas do terapeuta, conforme CFP nº 001/2009)
    const clinicalRecordsSoap = (await ClinicalRecordRepository.list({ patientIds: [dto.patientId] }))
      .sort((a, b) => a.sessionNumber - b.sessionNumber)
      .map((r) => {
        let subjective = '';
        let objective = '';
        let assessment = '';
        let plan = '';
        try {
          if (r.encryptedSoapSubjective) subjective = decryptField(r.encryptedSoapSubjective);
          if (r.encryptedSoapObjective) objective = decryptField(r.encryptedSoapObjective);
          if (r.encryptedSoapAssessment) assessment = decryptField(r.encryptedSoapAssessment);
          if (r.encryptedSoapPlan) plan = decryptField(r.encryptedSoapPlan);
        } catch {
          // fallback
        }
        return {
          id: r.id,
          sessionNumber: r.sessionNumber,
          isSigned: r.isSigned,
          signatureHash: r.signatureHash,
          soap: { subjective, objective, assessment, plan },
          createdAt: new Date(r.createdAt).toISOString()
        };
      });

    // 5. Escalas Psicométricas (PHQ-9 / GAD-7)
    const psychometricAssessments = Array.from(db.psychometricAssessments.values())
      .filter((p) => p.patientId === dto.patientId)
      .map((p) => ({
        id: p.id,
        scaleType: p.scaleType,
        totalScore: p.totalScore,
        severityLevel: p.severityLevel,
        assessedAt: new Date(p.createdAt).toISOString()
      }));

    // 6. Árvore de Decisão Diagnóstica & Triagem Inicial
    const diagnosticDecisionReports = Array.from(db.diagnosticReports.values())
      .filter((d) => d.patientId === dto.patientId)
      .map((d) => ({
        id: d.id,
        primaryTrack: d.primaryTrack,
        provisionalCid11: d.provisionalCid11,
        urgencyLevel: d.urgencyLevel,
        psychometricBaseline: d.psychometricBaseline,
        integrityChecksumSha256: d.integrityChecksumSha256,
        createdAt: new Date(d.createdAt).toISOString()
      }));

    // 7. Metas Terapêuticas SMART
    const therapeuticGoalsSmart = Array.from(db.therapeuticGoals.values())
      .filter((g) => g.patientId === dto.patientId)
      .map((g) => {
        // O título da meta não é cifrado; só descrição e notas
        const title = g.title;
        let description = '';
        try {
          description = decryptField(g.encryptedDescription);
        } catch {
          // fallback
        }
        return {
          id: g.id,
          title,
          description,
          status: g.status,
          progressPercent: g.progressPercent,
          targetDate: g.targetDate
        };
      });

    // 8. Exercícios Terapêuticos do Portal do Paciente (TCC/ACT/DBT)
    const portalExercises = Array.from(db.therapeuticExercises.values())
      .filter((e) => e.patientId === dto.patientId)
      .map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        status: e.status,
        assignedAt: e.assignedAt,
        completedAt: e.completedAt,
        therapistFeedback: e.therapistFeedback
      }));

    // 9. Documentos Psicológicos CFP nº 006/2019
    const psychologicalDocuments = Array.from(db.documents.values())
      .filter((d) => d.patientId === dto.patientId)
      .map((d) => {
        let content = '';
        try {
          content = decryptField(d.encryptedContent);
        } catch {
          // fallback
        }
        return {
          id: d.id,
          type: d.type,
          title: d.title,
          content,
          validationToken: d.validationToken,
          isSigned: d.isSigned,
          createdAt: new Date(d.createdAt).toISOString()
        };
      });

    // 10. Guias de Encaminhamento Psiquiátrico (sem notas confidenciais privadas do psicólogo)
    const psychiatricReferrals = Array.from(db.psychiatricReferrals.values())
      .filter((r) => r.patientId === dto.patientId)
      .map((r) => ({
        id: r.id,
        urgencyLevel: r.urgencyLevel,
        reasonForReferral: r.reasonForReferral,
        clinicalHypothesesCid11: r.clinicalHypothesesCid11,
        currentMedications: r.currentMedications,
        detectedInteractions: r.detectedInteractions,
        validationToken: r.validationToken,
        createdAt: new Date(r.createdAt).toISOString()
      }));

    // 11. Recibos de Honorários para Reembolso / DMED
    const billingReceiptsDmed = Array.from(db.receipts.values())
      .filter((rec) => rec.patientId === dto.patientId)
      .map((rec) => ({
        id: rec.id,
        receiptNumber: rec.receiptNumber,
        amountCents: rec.amountCents,
        amountFormatted: rec.amountFormatted,
        paymentMethod: rec.paymentMethod,
        paymentStatus: rec.paymentStatus,
        paymentDate: rec.paymentDate,
        validationToken: rec.validationToken,
        documentHashSha256: rec.documentHashSha256
      }));

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
    const exportedAt = new Date().toISOString();

    const coreWithoutCanonical = {
      schemaVersion: '2.0.0-RFC001' as const,
      exportedAt,
      requestReason:
        dto.requestReason ||
        'Exercício do Direito de Portabilidade e Autodeterminação Informativa (LGPD Art. 18, incisos II e V)',
      regulationCompliance: {
        lgpdArticles: ['Art. 18, II', 'Art. 18, V', 'Art. 16, I'],
        cfpResolutions: [
          'Resolução CFP nº 001/2009 (Guarda Documental de 5 Anos)',
          'Resolução CFP nº 006/2019 (Documentos Psicológicos)',
          'Resolução CFP nº 011/2018 (Telepsicologia)'
        ],
        retentionGuaranteeYears: 5,
        holderAutonomyStatement:
          'Este arquivo .enc contém a integralidade do prontuário clínico do titular, cifrado com chave derivada exclusivamente da sua senha pessoal (Argon2id + AES-256-GCM).'
      },
      therapist: {
        id: therapist?.id || 'therapist-001',
        name: therapistName,
        crp: therapist?.crp || '06/142980',
        crpRegion: therapist?.crpRegion || 'SP'
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

    const canonicalSha256 = sha256Hex(canonicalizePortabilityJson(coreWithoutCanonical));
    const fullPayload: ConsolidatedPortabilityPayload = {
      ...coreWithoutCanonical,
      canonicalSha256
    };

    const vaultFile = createEncryptedPortabilityVault({
      payload: fullPayload,
      holderPassphrase: dto.holderPassphrase,
      kdfAlgorithm: dto.kdfAlgorithm || PortabilityKdfAlgorithm.ARGON2ID
    });

    const totalRecordsCount = sectionDigests.reduce((acc, s) => acc + s.recordsCount, 0);

    PortabilityVaultService.vaultHistory.unshift({
      vaultId: vaultFile.vaultId,
      patientId: vaultFile.patientId,
      patientInitials: vaultFile.patientInitials,
      kdfAlgorithm: vaultFile.kdfAlgorithm,
      merkleRootSha256: vaultFile.merkleRootSha256,
      sealToken: vaultFile.notarySeal.sealToken,
      totalRecordsCount,
      exportedAt: vaultFile.exportedAt
    });

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PORTABILITY_ENC_VAULT,
      resourceId: vaultFile.vaultId,
      action: AuditAction.PORTABILITY_ENC_VAULT_GENERATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    const fileName = `prontuario-titular-${dto.patientId.slice(0, 8)}-${vaultFile.vaultId}.enc`;

    return {
      success: true,
      vaultFile,
      fileName,
      merkleRootSha256: vaultFile.merkleRootSha256,
      notarySeal: vaultFile.notarySeal,
      message:
        'Pacote .enc gerado com sucesso via Argon2id + AES-256-GCM, Raiz de Merkle de 11 seções e Selo Notarial WORM.'
    };
  }

  public static verifyVault(params: {
    dto: VerifyPortabilityEncVaultDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): VerifyPortabilityEncVaultResponse {
    const verification = verifyEncryptedPortabilityVault(
      params.dto.vaultFile,
      params.dto.holderPassphrase
    );

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.PORTABILITY_ENC_VAULT,
      resourceId: verification.vaultId,
      action: AuditAction.PORTABILITY_ENC_VAULT_VERIFIED,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      success: true,
      verification,
      message: verification.details
    };
  }

  public static decryptVault(params: {
    dto: DecryptPortabilityEncVaultDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): DecryptPortabilityEncVaultResponse {
    const verification = verifyEncryptedPortabilityVault(
      params.dto.vaultFile,
      params.dto.holderPassphrase
    );

    if (!verification.isValid) {
      throw new Error(verification.details);
    }

    const payload = decryptEncryptedPortabilityVault(
      params.dto.vaultFile,
      params.dto.holderPassphrase
    );

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.PORTABILITY_ENC_VAULT,
      resourceId: verification.vaultId,
      action: AuditAction.PORTABILITY_ENC_VAULT_DECRYPTED,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      success: true,
      payload,
      verification,
      message: 'Pacote .enc decifrado e autenticado com 100% de integridade.'
    };
  }

  public static getPatientVaultHistory(patientId: string): PortabilityVaultHistoryResponse {
    const filtered = PortabilityVaultService.vaultHistory.filter(
      (v) => v.patientId === patientId
    );
    return {
      success: true,
      vaults: filtered,
      total: filtered.length
    };
  }
}
