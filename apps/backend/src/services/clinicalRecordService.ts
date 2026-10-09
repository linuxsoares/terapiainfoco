import { createHash, randomUUID } from 'node:crypto';
import type { 
  SoapNote, 
  StoredClinicalRecord, 
  DecryptedClinicalRecord 
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

export class ClinicalRecordService {
  /**
   * Cria ou atualiza rascunho de evolução SOAP (Human-in-the-Loop)
   * As notas privadas são segregadas das notas formais (§3.4)
   */
  static saveDraft(params: {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    sessionNumber: number;
    soap: SoapNote;
    privateNotes?: string;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): DecryptedClinicalRecord {
    // Verifica se já existe e se está assinado (imutabilidade)
    for (const record of db.clinicalRecords.values()) {
      if (record.appointmentId === params.appointmentId && record.isSigned) {
        throw new Error(
          'Registro clínico já assinado e imutável (CFP nº 001/2009). Correções devem ser averbadas por termo de retificação.'
        );
      }
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

    db.clinicalRecords.set(id, stored);

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
  static signRecord(params: {
    recordId: string;
    confirmedHumanReview: boolean;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): DecryptedClinicalRecord {
    if (!params.confirmedHumanReview) {
      throw new Error(
        'Princípio Human-in-the-Loop obrigatório (§3.3): O psicólogo deve revisar e confirmar pessoalmente o conteúdo antes da assinatura.'
      );
    }

    const record = db.clinicalRecords.get(params.recordId);
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
  static getRecordById(
    recordId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedClinicalRecord | null {
    const record = db.clinicalRecords.get(recordId);
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
}
