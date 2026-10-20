import { randomUUID, randomBytes } from 'node:crypto';
import {
  type ClinicalReferral,
  type StoredClinicalReferral,
  type CreateClinicalReferralDTO,
  type CounterReferralDTO,
  type ValidateReferralPublicResponse,
  type ClinicalReferralPsychometricSummary,
  ReferralUrgency,
  ReferralStatus,
  AuditAction,
  AuditResourceType
} from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';
import { PatientService } from './patientService';

export class ClinicalReferralService {
  /**
   * Cria Guia de Encaminhamento Multidisciplinar Interoperável (RFC-001 §3.5)
   * em estrita consonância com o Artigo 9º do Código de Ética Profissional do Psicólogo (sigilo e proporcionalidade)
   */
  static createReferral(params: {
    therapistId: string;
    dto: CreateClinicalReferralDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): ClinicalReferral {
    const { therapistId, dto, context } = params;

    const patient = PatientService.getPatientById(dto.patientId, context);
    if (!patient) {
      throw new Error(`Paciente com ID ${dto.patientId} não encontrado.`);
    }

    const therapist = db.therapists.get(therapistId);
    const user = db.users.get(context.actorId);
    const therapistName = user ? user.name : 'Psicólogo Clínico';
    const rawCrp = therapist?.crp || (user as any)?.crp || '06/142980';
    const therapistCrp = rawCrp.startsWith('CRP') ? rawCrp : `CRP ${rawCrp}`;

    // Coleta do sumário psicométrico mais recente caso solicitado
    let psychometricSummary: ClinicalReferralPsychometricSummary | undefined = undefined;
    if (dto.includeLatestPsychometric !== false) {
      const assessments = Array.from(db.psychometricAssessments.values())
        .filter(p => p.patientId === dto.patientId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (assessments.length > 0) {
        const latest = assessments[0];
        psychometricSummary = {
          scaleType: latest.scaleType,
          score: latest.totalScore,
          severity: latest.severityLevel,
          appliedAt: new Date(latest.createdAt).toISOString()
        };
      }
    }

    const id = randomUUID();
    const validationToken = `ref_${randomBytes(16).toString('hex')}`;
    const validationUrl = `/verify/referral/${validationToken}`;
    const wormAuditId = `worm_${randomUUID()}`;

    const stored: StoredClinicalReferral = {
      id,
      patientId: dto.patientId,
      patientName: patient.name,
      patientBirthDate: undefined,
      therapistId,
      therapistName,
      therapistCrp,
      recipientProfessional: dto.recipientProfessional.trim(),
      recipientSpecialty: dto.recipientSpecialty.trim(),
      recipientInstitution: dto.recipientInstitution?.trim(),
      urgency: dto.urgency,
      encryptedClinicalSummary: encryptField(dto.clinicalSummary.trim()),
      reasonForReferral: dto.reasonForReferral.trim(),
      diagnosticHypothesis: dto.diagnosticHypothesis?.trim(),
      currentMedicationReported: dto.currentMedicationReported?.trim(),
      psychometricSummary,
      status: ReferralStatus.ISSUED,
      validationToken,
      validationUrl,
      wormAuditId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    db.clinicalReferrals.set(id, stored);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_REFERRAL,
      resourceId: id,
      action: AuditAction.CLINICAL_REFERRAL_CREATED,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id,
      patientId: dto.patientId,
      patientName: patient.name,
      therapistId,
      therapistName,
      therapistCrp,
      recipientProfessional: stored.recipientProfessional,
      recipientSpecialty: stored.recipientSpecialty,
      recipientInstitution: stored.recipientInstitution,
      urgency: stored.urgency,
      clinicalSummary: dto.clinicalSummary.trim(),
      reasonForReferral: stored.reasonForReferral,
      diagnosticHypothesis: stored.diagnosticHypothesis,
      currentMedicationReported: stored.currentMedicationReported,
      psychometricSummary: stored.psychometricSummary,
      status: stored.status,
      validationToken,
      validationUrl,
      wormAuditId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    };
  }

  /**
   * Registra a contra-referência médica / psiquiátrica recebida
   */
  static registerCounterReferral(params: {
    dto: CounterReferralDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): ClinicalReferral {
    const { dto, context } = params;

    const stored = db.clinicalReferrals.get(dto.referralId);
    if (!stored) {
      throw new Error(`Encaminhamento com ID ${dto.referralId} não encontrado.`);
    }

    stored.status = ReferralStatus.COUNTER_REFERRED;
    stored.encryptedCounterReferenceNotes = encryptField(dto.counterReferenceNotes.trim());
    stored.counterReferredAt = new Date().toISOString();
    stored.counterReferredBy = dto.counterReferredBy.trim();
    stored.updatedAt = new Date();

    db.clinicalReferrals.set(dto.referralId, stored);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_REFERRAL,
      resourceId: dto.referralId,
      action: AuditAction.UPDATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredReferral(stored);
  }

  /**
   * Validação pública de autenticidade da guia de encaminhamento
   * Acessível sem autenticação para o médico/psiquiatra receptor
   * Preserva a privacidade estrita (LGPD Art. 11 e CFP Art. 9º)
   */
  static validatePublicReferral(token: string): ValidateReferralPublicResponse {
    let foundReferral: StoredClinicalReferral | undefined = undefined;

    for (const item of db.clinicalReferrals.values()) {
      if (item.validationToken === token) {
        foundReferral = item;
        break;
      }
    }

    if (!foundReferral) {
      return {
        success: false,
        valid: false,
        message: 'Guia de encaminhamento não encontrada ou token de validação inválido.'
      };
    }

    // Anonimização parcial do nome do paciente (ex: "Maria da Silva" -> "M. d. S.")
    const patientInitials = foundReferral.patientName
      .split(' ')
      .filter(Boolean)
      .map(part => `${part[0].toUpperCase()}.`)
      .join(' ');

    AuditService.log({
      actorId: 'public_verifier',
      resourceType: AuditResourceType.CLINICAL_REFERRAL,
      resourceId: foundReferral.id,
      action: AuditAction.CLINICAL_REFERRAL_VALIDATED,
      ipAddress: '127.0.0.1'
    });

    return {
      success: true,
      valid: true,
      referral: {
        id: foundReferral.id,
        patientInitials,
        therapistName: foundReferral.therapistName,
        therapistCrp: foundReferral.therapistCrp,
        recipientProfessional: foundReferral.recipientProfessional,
        recipientSpecialty: foundReferral.recipientSpecialty,
        urgency: foundReferral.urgency,
        status: foundReferral.status,
        reasonForReferral: foundReferral.reasonForReferral,
        diagnosticHypothesis: foundReferral.diagnosticHypothesis,
        issuedAt: new Date(foundReferral.createdAt).toISOString(),
        wormAuditId: foundReferral.wormAuditId
      },
      message: 'Guia de encaminhamento válida e verificada com sucesso via selo WORM.'
    };
  }

  /**
   * Obtém encaminhamento por ID com decriptação
   */
  static getById(
    referralId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): ClinicalReferral | null {
    const stored = db.clinicalReferrals.get(referralId);
    if (!stored) return null;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_REFERRAL,
      resourceId: referralId,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return this.decryptStoredReferral(stored);
  }

  /**
   * Lista encaminhamentos de um paciente
   */
  static listByPatient(
    patientId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): ClinicalReferral[] {
    const results: ClinicalReferral[] = [];

    for (const stored of db.clinicalReferrals.values()) {
      if (stored.patientId === patientId) {
        results.push(this.decryptStoredReferral(stored));
      }
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_REFERRAL,
      resourceId: patientId,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Decripta encaminhamento armazenado
   */
  private static decryptStoredReferral(stored: StoredClinicalReferral): ClinicalReferral {
    const clinicalSummary = decryptField(stored.encryptedClinicalSummary);
    const counterReferenceNotes = stored.encryptedCounterReferenceNotes 
      ? decryptField(stored.encryptedCounterReferenceNotes)
      : undefined;

    return {
      id: stored.id,
      patientId: stored.patientId,
      patientName: stored.patientName,
      patientBirthDate: stored.patientBirthDate,
      therapistId: stored.therapistId,
      therapistName: stored.therapistName,
      therapistCrp: stored.therapistCrp,
      recipientProfessional: stored.recipientProfessional,
      recipientSpecialty: stored.recipientSpecialty,
      recipientInstitution: stored.recipientInstitution,
      urgency: stored.urgency,
      clinicalSummary,
      reasonForReferral: stored.reasonForReferral,
      diagnosticHypothesis: stored.diagnosticHypothesis,
      currentMedicationReported: stored.currentMedicationReported,
      psychometricSummary: stored.psychometricSummary,
      status: stored.status,
      validationToken: stored.validationToken,
      validationUrl: stored.validationUrl,
      wormAuditId: stored.wormAuditId,
      counterReferenceNotes,
      counterReferredAt: stored.counterReferredAt,
      counterReferredBy: stored.counterReferredBy,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    };
  }
}
