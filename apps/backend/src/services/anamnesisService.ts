import { randomUUID } from 'node:crypto';
import type { 
  SaveAnamnesisDTO, 
  DecryptedAnamnesisRecord, 
  StoredAnamnesisRecord 
} from '@terapiainfoco/shared';
import { AuditAction, AuditResourceType } from '@terapiainfoco/shared';
import { db } from '../db/memoryDb';
import { encryptField, decryptField } from './cryptoContext';
import { AuditService } from './auditService';

import { PatientRepository } from '../repositories/patientRepository';
export class AnamnesisService {
  /**
   * Salva ou atualiza a Ficha de Anamnese Biopsicossocial de um paciente
   * Aplica Field-Level Encryption (AES-256-GCM) em todos os dados clínicos sensíveis
   */
  public static async saveAnamnesis(params: {
    patientId: string;
    therapistId: string;
    dto: SaveAnamnesisDTO;
    context: { actorId: string; ipAddress: string; userAgent?: string };
  }): Promise<DecryptedAnamnesisRecord> {
    const patient = await PatientRepository.findById(params.patientId);
    if (!patient) {
      throw new Error('Paciente não encontrado para registro de anamnese.');
    }

    if (!params.dto.chiefComplaint || !params.dto.chiefComplaint.trim()) {
      throw new Error('A queixa principal é obrigatória na ficha de anamnese (Resolução CFP nº 001/2009).');
    }

    // Procura anamnese existente para o paciente
    let existingRecord: StoredAnamnesisRecord | null = null;
    for (const record of db.anamnesisRecords.values()) {
      if (record.patientId === params.patientId) {
        existingRecord = record;
        break;
      }
    }

    const id = existingRecord?.id || randomUUID();
    const version = existingRecord ? existingRecord.version + 1 : 1;
    const now = new Date();

    const stored: StoredAnamnesisRecord = {
      id,
      patientId: params.patientId,
      therapistId: params.therapistId,
      version,
      encryptedChiefComplaint: encryptField(params.dto.chiefComplaint.trim()),
      encryptedHistoryOfComplaint: encryptField(params.dto.historyOfComplaint?.trim() || ''),
      encryptedBiopsychosocialHistory: encryptField(JSON.stringify(params.dto.biopsychosocialHistory || {})),
      encryptedMedicalAndPsychiatricHistory: encryptField(JSON.stringify(params.dto.medicalAndPsychiatricHistory || {})),
      encryptedTherapeuticGoals: encryptField(params.dto.therapeuticGoals?.trim() || ''),
      encryptedEmergencyContact: params.dto.emergencyContact 
        ? encryptField(JSON.stringify(params.dto.emergencyContact)) 
        : undefined,
      createdAt: existingRecord?.createdAt || now,
      updatedAt: now
    };

    db.anamnesisRecords.set(id, stored);

    AuditService.log({
      actorId: params.context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: id,
      action: existingRecord ? AuditAction.UPDATE : AuditAction.CREATE,
      ipAddress: params.context.ipAddress,
      userAgent: `Ficha de Anamnese Biopsicossocial (v${version}) gravada com FLE AES-256-GCM`
    });

    return {
      id,
      patientId: params.patientId,
      therapistId: params.therapistId,
      version,
      chiefComplaint: params.dto.chiefComplaint.trim(),
      historyOfComplaint: params.dto.historyOfComplaint?.trim() || '',
      biopsychosocialHistory: params.dto.biopsychosocialHistory || {},
      medicalAndPsychiatricHistory: params.dto.medicalAndPsychiatricHistory || {},
      therapeuticGoals: params.dto.therapeuticGoals?.trim() || '',
      emergencyContact: params.dto.emergencyContact,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    };
  }

  /**
   * Recupera a Ficha de Anamnese decifrada para o profissional autorizado
   */
  public static getAnamnesisByPatientId(
    patientId: string,
    context: { actorId: string; ipAddress: string; userAgent?: string }
  ): DecryptedAnamnesisRecord | null {
    let stored: StoredAnamnesisRecord | null = null;
    for (const record of db.anamnesisRecords.values()) {
      if (record.patientId === patientId) {
        stored = record;
        break;
      }
    }

    if (!stored) {
      return null;
    }

    AuditService.log({
      actorId: context.actorId,
      resourceType: AuditResourceType.CLINICAL_RECORD,
      resourceId: stored.id,
      action: AuditAction.DECRYPT_READ,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent || 'Leitura de Anamnese Biopsicossocial decifrada em memória'
    });

    let bioHistory = {};
    try {
      bioHistory = JSON.parse(decryptField(stored.encryptedBiopsychosocialHistory));
    } catch {}

    let medHistory = {};
    try {
      medHistory = JSON.parse(decryptField(stored.encryptedMedicalAndPsychiatricHistory));
    } catch {}

    let emergency = undefined;
    if (stored.encryptedEmergencyContact) {
      try {
        emergency = JSON.parse(decryptField(stored.encryptedEmergencyContact));
      } catch {}
    }

    return {
      id: stored.id,
      patientId: stored.patientId,
      therapistId: stored.therapistId,
      version: stored.version,
      chiefComplaint: decryptField(stored.encryptedChiefComplaint),
      historyOfComplaint: decryptField(stored.encryptedHistoryOfComplaint),
      biopsychosocialHistory: bioHistory,
      medicalAndPsychiatricHistory: medHistory,
      therapeuticGoals: decryptField(stored.encryptedTherapeuticGoals),
      emergencyContact: emergency,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    };
  }
}
