import { randomUUID } from 'node:crypto';
import type { 
  CreatePatientDTO, 
  StoredPatient, 
  DecryptedPatient 
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { 
  encryptField, 
  decryptField, 
  hashEmail, 
  hashCpf 
} from './cryptoContext';
import { AuditService } from './auditService';

export class PatientService {
  /**
   * Cadastra paciente aplicando Field-Level Encryption e Blind Indexing (§4.1, §4.3)
   */
  static createPatient(
    therapistId: string, 
    dto: CreatePatientDTO,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient {
    const id = randomUUID();
    const emailBindex = hashEmail(dto.email);
    const cpfBindex = dto.cpf ? hashCpf(dto.cpf) : undefined;

    const storedPatient: StoredPatient = {
      id,
      therapistId,
      emailBindex,
      cpfBindex,
      consentTranscriptionSigned: dto.consentTranscriptionSigned,
      consentSignedAt: dto.consentTranscriptionSigned ? new Date() : null,
      createdAt: new Date(),
      encryptedName: encryptField(dto.name),
      encryptedEmail: encryptField(dto.email),
      encryptedPhone: encryptField(dto.phone),
      encryptedCpf: dto.cpf ? encryptField(dto.cpf) : undefined
    };

    db.patients.set(id, storedPatient);

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.CREATE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id,
      therapistId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      cpf: dto.cpf,
      emailBindex,
      cpfBindex,
      consentTranscriptionSigned: storedPatient.consentTranscriptionSigned,
      consentSignedAt: storedPatient.consentSignedAt,
      createdAt: storedPatient.createdAt
    };
  }

  /**
   * Busca paciente por ID e decripta dados em memória para o terapeuta autenticado
   */
  static getPatientById(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient | null {
    const stored = db.patients.get(id);
    if (!stored) return null;

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      id: stored.id,
      therapistId: stored.therapistId,
      name: decryptField(stored.encryptedName),
      email: decryptField(stored.encryptedEmail),
      phone: decryptField(stored.encryptedPhone),
      cpf: stored.encryptedCpf ? decryptField(stored.encryptedCpf) : undefined,
      emailBindex: stored.emailBindex,
      cpfBindex: stored.cpfBindex,
      consentTranscriptionSigned: stored.consentTranscriptionSigned,
      consentSignedAt: stored.consentSignedAt,
      createdAt: stored.createdAt
    };
  }

  /**
   * Busca por CPF usando Blind Index (HMAC-SHA256) sem expor CPF no banco (§4.3)
   */
  static findByCpf(
    rawCpf: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedPatient | null {
    const targetBindex = hashCpf(rawCpf);
    for (const patient of db.patients.values()) {
      if (patient.cpfBindex === targetBindex) {
        return this.getPatientById(patient.id, context);
      }
    }
    return null;
  }

  /**
   * Harmonização LGPD Art. 18 vs. CFP (Resolução nº 001/2009 - Guarda de 5 Anos)
   * Anonimiza dados de contato e coloca o cadastro em quarentena legal.
   */
  static quarantinePatient(
    id: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): boolean {
    const stored = db.patients.get(id);
    if (!stored) return false;

    // Pseudonimização dos dados de contato ativos
    stored.encryptedName = encryptField('[PACIENTE EM QUARENTENA LGPD]');
    stored.encryptedEmail = encryptField('quarentena@anonimizado.local');
    stored.encryptedPhone = encryptField('00000000000');
    stored.emailBindex = hashEmail(`quarentena-${id}@anonimizado.local`);
    if (stored.encryptedCpf) {
      stored.encryptedCpf = undefined;
      stored.cpfBindex = undefined;
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.PATIENT,
      resourceId: id,
      action: AuditAction.QUARANTINE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return true;
  }
}
