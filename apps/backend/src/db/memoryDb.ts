import type {
  Therapist,
  StoredPatient,
  StoredAppointment,
  StoredClinicalRecord,
  StoredPsychologicalDocument,
  StoredSessionTranscription,
  AuditLog
} from '@terapiainfoco/shared';
import { encryptField } from '../services/cryptoContext';

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
  public sessionTranscriptions: Map<string, StoredSessionTranscription> = new Map();
  public auditLogs: AuditLog[] = [];

  constructor() {
    this.seedDefaultTherapist();
    this.seedDemoSession();
  }

  public seedDefaultTherapist() {
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

  public seedDemoSession() {
    this.seedDefaultTherapist();
    const defaultPatientId = '00000000-0000-0000-0000-000000000002';
    if (!this.patients.has(defaultPatientId)) {
      this.patients.set(defaultPatientId, {
        id: defaultPatientId,
        therapistId: 'therapist-001',
        emailBindex: 'bindex-mariana-silva',
        cpfBindex: 'bindex-cpf-12345678900',
        consentTranscriptionSigned: true,
        consentSignedAt: new Date(),
        createdAt: new Date(),
        encryptedName: encryptField('Mariana Silva de Oliveira'),
        encryptedEmail: encryptField('mariana.silva@email.com'),
        encryptedPhone: encryptField('(11) 98765-4321'),
        encryptedCpf: encryptField('123.456.789-00')
      });
    }

    const defaultAppointmentId = '00000000-0000-0000-0000-000000000010';
    if (!this.appointments.has(defaultAppointmentId)) {
      this.appointments.set(defaultAppointmentId, {
        id: defaultAppointmentId,
        therapistId: 'therapist-001',
        patientId: defaultPatientId,
        scheduledStart: new Date(Date.now() - 3600000),
        scheduledEnd: new Date(),
        status: 'CONFIRMED' as any,
        googleEventId: 'gevent-mock-001',
        meetAccessCode: 'abc-defg-hij',
        encryptedMeetUrl: encryptField('https://meet.google.com/abc-defg-hij'),
        createdAt: new Date()
      });
    }
  }

  clear() {
    this.patients.clear();
    this.appointments.clear();
    this.clinicalRecords.clear();
    this.documents.clear();
    this.sessionTranscriptions.clear();
    this.auditLogs = [];
  }
}

export const db = new MemoryDatabase();
