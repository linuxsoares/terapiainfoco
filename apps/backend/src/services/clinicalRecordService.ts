import { createHash, randomUUID } from 'node:crypto';
import type { 
  SoapNote, 
  StoredClinicalRecord, 
  DecryptedClinicalRecord,
  CreateRectificationDTO,
  ClinicalRecordRectification,
  StoredClinicalRecordRectification
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';


import { ClinicalRecordRepository } from '../repositories/clinicalRecordRepository';
export class ClinicalRecordService {
  /**
   * Cria ou atualiza rascunho de evolução SOAP (Human-in-the-Loop)
   * As notas privadas são segregadas das notas formais (§3.4)
   */
  static async saveDraft(params: {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    sessionNumber: number;
    soap: SoapNote;
    privateNotes?: string;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<DecryptedClinicalRecord> {
    // Verifica se já existe e se está assinado (imutabilidade)
    if (await ClinicalRecordRepository.count({ appointmentId: params.appointmentId, signed: true }) > 0) {
      throw new Error(
        'Registro clínico já assinado e imutável (CFP nº 001/2009). Correções devem ser averbadas por termo de retificação.'
      );
    }

    const id = randomUUID();
    const stored: StoredClinicalRecord = {
      id,
      appointmentId: params.appointmentId,
      patientId: params.patientId,
      therapistId: params.therapistId,
      sessionNumber: params.sessionNumber,
      encryptedSoapSubjective: encryptField(params.soap.subjective),
      encryptedSoapObjective: encryptField(params.soap.objective),
      encryptedSoapAssessment: encryptField(params.soap.assessment),
      encryptedSoapPlan: encryptField(params.soap.plan),
      encryptedPrivateNotes: params.privateNotes ? encryptField(params.privateNotes) : undefined,
      isSigned: false,
      signedAt: null,
      signatureHash: null,
      createdAt: new Date()
    };

    await ClinicalRecordRepository.create(stored);

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      id,
      appointmentId: params.appointmentId,
      patientId: params.patientId,
      therapistId: params.therapistId,
      sessionNumber: params.sessionNumber,
      soap: params.soap,
      privateNotes: params.privateNotes,
      isSigned: false,
      signedAt: null,
      signatureHash: null,
      createdAt: stored.createdAt
    };
  }

  /**
   * Assina e sela o prontuário com o princípio Human-in-the-Loop
   * Torna o registro imutável (append-only) com carimbo de tempo e hash SHA-256
   */
  static async signRecord(params: {
    recordId: string;
    confirmedHumanReview: boolean;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<DecryptedClinicalRecord> {
    if (!params.confirmedHumanReview) {
      throw new Error(
        'Princípio Human-in-the-Loop obrigatório (§3.3): O psicólogo deve revisar e confirmar pessoalmente o conteúdo antes da assinatura.'
      );
    }

    const record = await ClinicalRecordRepository.findById(params.recordId);
    if (!record) {
      throw new Error('Prontuário não encontrado');
    }

    if (record.isSigned) {
      throw new Error('Este registro clínico já foi assinado anteriormente');
    }

    const signedAt = new Date();
    // Computa hash de integridade imutável dos campos clínicos
    const hashPayload = [
      record.id,
      record.patientId,
      record.sessionNumber,
      record.encryptedSoapSubjective?.ciphertext,
      record.encryptedSoapObjective?.ciphertext,
      record.encryptedSoapAssessment?.ciphertext,
      record.encryptedSoapPlan?.ciphertext,
      signedAt.toISOString()
    ].join('|');

    const signatureHash = createHash('sha256').update(hashPayload).digest('hex');

    record.isSigned = true;
    record.signedAt = signedAt;
    record.signatureHash = signatureHash;
    await ClinicalRecordRepository.save(record);

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: record.id,
      action: AuditAction.SIGN_RECORD,
      ipAddress: params.context.ipAddress,
      userAgent: params.context.userAgent
    });

    return {
      id: record.id,
      appointmentId: record.appointmentId,
      patientId: record.patientId,
      therapistId: record.therapistId,
      sessionNumber: record.sessionNumber,
      soap: {
        subjective: record.encryptedSoapSubjective ? decryptField(record.encryptedSoapSubjective) : '',
        objective: record.encryptedSoapObjective ? decryptField(record.encryptedSoapObjective) : '',
        assessment: record.encryptedSoapAssessment ? decryptField(record.encryptedSoapAssessment) : '',
        plan: record.encryptedSoapPlan ? decryptField(record.encryptedSoapPlan) : ''
      },
      privateNotes: record.encryptedPrivateNotes ? decryptField(record.encryptedPrivateNotes) : undefined,
      isSigned: true,
      signedAt,
      signatureHash,
      createdAt: record.createdAt
    };
  }

  /**
   * Recupera prontuário por ID decriptando apenas para o terapeuta autenticado
   */
  static async getRecordById(
    recordId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): Promise<DecryptedClinicalRecord | null> {
    const record = await ClinicalRecordRepository.findById(recordId);
    if (!record) return null;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: recordId,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: record.id,
      appointmentId: record.appointmentId,
      patientId: record.patientId,
      therapistId: record.therapistId,
      sessionNumber: record.sessionNumber,
      soap: {
        subjective: record.encryptedSoapSubjective ? decryptField(record.encryptedSoapSubjective) : '',
        objective: record.encryptedSoapObjective ? decryptField(record.encryptedSoapObjective) : '',
        assessment: record.encryptedSoapAssessment ? decryptField(record.encryptedSoapAssessment) : '',
        plan: record.encryptedSoapPlan ? decryptField(record.encryptedSoapPlan) : ''
      },
      privateNotes: record.encryptedPrivateNotes ? decryptField(record.encryptedPrivateNotes) : undefined,
      isSigned: record.isSigned,
      signedAt: record.signedAt,
      signatureHash: record.signatureHash,
      createdAt: record.createdAt
    };
  }

  /**
   * Averba Termo de Retificação Formal em prontuário previamente assinado e selado
   * (Resolução CFP nº 001/2009 e RFC §3.4)
   * Prontuários selados são imutáveis; correções são averbadas aditivamente com novo hash SHA-256.
   */
  static async addRectification(params: {
    clinicalRecordId: string;
    therapistId: string;
    dto: CreateRectificationDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<ClinicalRecordRectification> {
    const record = await ClinicalRecordRepository.findById(params.clinicalRecordId);
    if (!record) {
      throw new Error('Prontuário clínico não encontrado.');
    }

    if (!record.isSigned) {
      throw new Error(
        'Termos de Retificação aplicam-se exclusivamente a prontuários já selados e assinados. Para registros em rascunho, utilize a edição direta (CFP nº 001/2009).'
      );
    }

    if (!params.dto.confirmedEthicsReview) {
      throw new Error(
        'É obrigatória a confirmação explícita de responsabilidade ética para averbação do termo de retificação.'
      );
    }

    if (!params.dto.reason || !params.dto.reason.trim()) {
      throw new Error('A motivação formal da retificação é obrigatória.');
    }

    if (!params.dto.rectifiedContent || !params.dto.rectifiedContent.trim()) {
      throw new Error('O conteúdo retificado/aditivo é obrigatório.');
    }

    const id = randomUUID();
    const signedAt = new Date();

    // Cálculo do hash canônico SHA-256 da retificação
    const rawPayload = [
      id,
      params.clinicalRecordId,
      params.therapistId,
      params.dto.rectifiedQuadrant,
      params.dto.reason.trim(),
      params.dto.rectifiedContent.trim(),
      signedAt.toISOString()
    ].join('|');

    const signatureHash = createHash('sha256').update(rawPayload).digest('hex');

    const stored: StoredClinicalRecordRectification = {
      id,
      clinicalRecordId: params.clinicalRecordId,
      therapistId: params.therapistId,
      rectifiedQuadrant: params.dto.rectifiedQuadrant,
      encryptedReason: encryptField(params.dto.reason.trim()),
      encryptedRectifiedContent: encryptField(params.dto.rectifiedContent.trim()),
      signatureHash,
      signedAt,
      createdAt: signedAt
    };

    db.clinicalRecordRectifications.set(id, stored);

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: params.clinicalRecordId,
      action: AuditAction.UPDATE,
      ipAddress: params.context.ipAddress,
      userAgent: `Termo de Retificação averbado: Quadrante=${params.dto.rectifiedQuadrant}, Hash=${signatureHash.slice(0, 16)}...`
    });

    return {
      id,
      clinicalRecordId: params.clinicalRecordId,
      therapistId: params.therapistId,
      rectifiedQuadrant: params.dto.rectifiedQuadrant,
      reason: params.dto.reason.trim(),
      rectifiedContent: params.dto.rectifiedContent.trim(),
      signatureHash,
      signedAt,
      createdAt: signedAt
    };
  }

  /**
   * Lista todos os termos de retificação averbados para um prontuário
   */
  static getRectifications(
    clinicalRecordId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): ClinicalRecordRectification[] {
    const results: ClinicalRecordRectification[] = [];

    for (const rect of db.clinicalRecordRectifications.values()) {
      if (rect.clinicalRecordId === clinicalRecordId) {
        results.push({
          id: rect.id,
          clinicalRecordId: rect.clinicalRecordId,
          therapistId: rect.therapistId,
          rectifiedQuadrant: rect.rectifiedQuadrant,
          reason: decryptField(rect.encryptedReason),
          rectifiedContent: decryptField(rect.encryptedRectifiedContent),
          signatureHash: rect.signatureHash,
          signedAt: rect.signedAt,
          createdAt: rect.createdAt
        });
      }
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: clinicalRecordId,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent || 'Leitura de termos de retificação averbados'
    });

    return results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
}

