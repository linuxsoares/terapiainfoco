import type {
  Therapist,
  StoredPatient,
  StoredAppointment,
  StoredClinicalRecord,
  StoredPsychologicalDocument,
  AuditLog
} from '@terapiainfoco/shared';

/**
 * Banco em memória representando os esquemas relacionais da RFC-001 §5.2
 * Permite isolamento em testes e execução local instantânea com Bun
 */
export class MemoryDatabase {
  public therapists: Map<string, Therapist> = new Map();
  public patients: Map<string, StoredPatient> = new Map();
  public appointments: Map<string, StoredAppointment> = new Map();
  public clinicalRecords: Map<string, StoredClinicalRecord> = new Map();
  public documents: Map<string, StoredPsychologicalDocument> = new Map();
  public auditLogs: AuditLog[] = [];

  constructor() {
    this.seedDefaultTherapist();
  }

  private seedDefaultTherapist() {
    const defaultTherapist: Therapist = {
      id: 'therapist-001',
      crp: '06/142980',
      crpRegion: 'SP',
      status: 'ACTIVE' as any,
      encryptedDek: 'mock-encrypted-dek-base64',
      createdAt: new Date()
    };
    this.therapists.set(defaultTherapist.id, defaultTherapist);
  }

  clear() {
    this.patients.clear();
    this.appointments.clear();
    this.clinicalRecords.clear();
    this.documents.clear();
    this.auditLogs = [];
  }
}

export const db = new MemoryDatabase();
