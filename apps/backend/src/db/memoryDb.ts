import type {
  Therapist,
  StoredAppointment,
  StoredClinicalRecord,
  StoredPsychologicalDocument,
  StoredSessionTranscription,
  AuditLog,
  User,
  StoredAnamnesisRecord,
  StoredClinicalRecordRectification,
  PasskeyCredential,
  WebAuthnChallengeSession,
  DPIAReport,
  StoredLiveTranscript,
  StoredLead,
  ExecutiveCompliancePackage,
  StoredAppointmentReminder,
  StoredClinicalSessionMarker,
  StoredTherapeuticGoal,
  PsychometricAssessment,
  StoredConsolidatedClinicalReport,
  StoredClinicalReferral,
  StoredClinicalReceipt,
  StoredFeeContract,
  StoredTeleconsultationRoom,
  StoredTranscriptionSession,
  AiSoapDraft,
  IcpBatchClosingManifest,
  TherapeuticExercise,
  DiagnosticAssessmentReport,
  PsychiatricReferralGuide
} from '@terapiainfoco/shared';
import { UserRole } from '@terapiainfoco/shared';
import type { LocalKmsState } from '@terapiainfoco/crypto';
import { config } from '../config';
import { EntityPersistence, TrackedMap, TrackedSet, mapSource, setSource, appendOnlySource } from './persistence';

/**
 * Banco em memória representando os esquemas relacionais da RFC-001 §5.2
 * Permite isolamento em testes e execução local instantânea com Bun
 */
export class MemoryDatabase {
  public therapists: TrackedMap<string, Therapist> = new TrackedMap();
  public appointments: TrackedMap<string, StoredAppointment> = new TrackedMap();
  public clinicalRecords: TrackedMap<string, StoredClinicalRecord> = new TrackedMap();
  public documents: TrackedMap<string, StoredPsychologicalDocument> = new TrackedMap();
  public sessionTranscriptions: TrackedMap<string, StoredSessionTranscription> = new TrackedMap();
  public anamnesisRecords: TrackedMap<string, StoredAnamnesisRecord> = new TrackedMap();
  public clinicalRecordRectifications: TrackedMap<string, StoredClinicalRecordRectification> = new TrackedMap();
  public reminders: TrackedMap<string, StoredAppointmentReminder> = new TrackedMap();
  public clinicalMarkers: TrackedMap<string, StoredClinicalSessionMarker> = new TrackedMap();
  public therapeuticGoals: TrackedMap<string, StoredTherapeuticGoal> = new TrackedMap();
  public psychometricAssessments: TrackedMap<string, PsychometricAssessment> = new TrackedMap();
  public consolidatedReports: TrackedMap<string, StoredConsolidatedClinicalReport> = new TrackedMap();
  public clinicalReferrals: TrackedMap<string, StoredClinicalReferral> = new TrackedMap();
  public receipts: TrackedMap<string, StoredClinicalReceipt> = new TrackedMap();
  public feeContracts: TrackedMap<string, StoredFeeContract> = new TrackedMap();
  public teleconsultationRooms: TrackedMap<string, StoredTeleconsultationRoom> = new TrackedMap();
  public transcriptionSessions: TrackedMap<string, StoredTranscriptionSession> = new TrackedMap();
  public aiSoapDrafts: TrackedMap<string, AiSoapDraft> = new TrackedMap();
  public batchClosingManifests: TrackedMap<string, IcpBatchClosingManifest> = new TrackedMap();
  public therapeuticExercises: TrackedMap<string, TherapeuticExercise> = new TrackedMap();
  public diagnosticReports: TrackedMap<string, DiagnosticAssessmentReport> = new TrackedMap();
  public psychiatricReferrals: TrackedMap<string, PsychiatricReferralGuide> = new TrackedMap();
  public patientAccessCodes: TrackedMap<string, { code: string; patientId: string; expiresAt: Date }> = new TrackedMap();
  public revokedTokens: TrackedSet<string> = new TrackedSet();
  public auditLogs: AuditLog[] = [];
  public passkeys: TrackedMap<string, PasskeyCredential> = new TrackedMap();
  public webauthnChallenges: TrackedMap<string, WebAuthnChallengeSession> = new TrackedMap();
  public dpiaReports: TrackedMap<string, DPIAReport> = new TrackedMap();
  /** Estado do KMS local (versão ativa e revogações de KEK), persistido para sobreviver a restarts */
  public kmsState: TrackedMap<string, LocalKmsState> = new TrackedMap();
  /** Transcrição das teleconsultas (texto cifrado; o áudio nunca é armazenado) */
  public liveTranscripts: TrackedMap<string, StoredLiveTranscript> = new TrackedMap();
  public leads: TrackedMap<string, StoredLead> = new TrackedMap();
  public compliancePackages: TrackedMap<string, ExecutiveCompliancePackage> = new TrackedMap();


  constructor() {
    if (config.demoMode) {
      this.seedDefaultTherapist();
      this.seedDemoSession();
    }
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

  /** Consulta de demonstração; o paciente dela fica na tabela `patients` (`seedDemoPatient`) */
  public seedDemoSession() {
    this.seedDefaultTherapist();
    const defaultPatientId = '00000000-0000-0000-0000-000000000002';
    const defaultAppointmentId = '00000000-0000-0000-0000-000000000010';
    if (!this.appointments.has(defaultAppointmentId)) {
      this.appointments.set(defaultAppointmentId, {
        id: defaultAppointmentId,
        therapistId: 'therapist-001',
        patientId: defaultPatientId,
        scheduledStart: new Date(Date.now() - 3600000),
        scheduledEnd: new Date(),
        status: 'CONFIRMED' as any,
        createdAt: new Date()
      });
    }
  }


  clear() {
    this.appointments.clear();
    this.clinicalRecords.clear();
    this.documents.clear();
    this.sessionTranscriptions.clear();
    this.anamnesisRecords.clear();
    this.clinicalRecordRectifications.clear();
    this.reminders.clear();
    this.clinicalMarkers.clear();
    this.therapeuticGoals.clear();
    this.psychometricAssessments.clear();
    this.consolidatedReports.clear();
    this.clinicalReferrals.clear();
    this.receipts.clear();
    this.feeContracts.clear();
    this.teleconsultationRooms.clear();
    this.transcriptionSessions.clear();
    this.aiSoapDrafts.clear();
    this.batchClosingManifests.clear();
    this.therapeuticExercises.clear();
    this.diagnosticReports.clear();
    this.psychiatricReferrals.clear();
    this.patientAccessCodes.clear();
    this.auditLogs = [];
    this.revokedTokens.clear();
    this.passkeys.clear();
    this.webauthnChallenges.clear();
    this.dpiaReports.clear();
    this.liveTranscripts.clear();
    this.leads.clear();
    this.compliancePackages.clear();
    this.seedDefaultTherapist();
  }
}


export const db = new MemoryDatabase();

/** Nomes das coleções chave-valor do cache de domínio persistidas no entity_store */
const MAP_COLLECTIONS = [
  'therapists', 'appointments', 'clinicalRecords', 'documents', 'sessionTranscriptions',
  'anamnesisRecords', 'clinicalRecordRectifications', 'reminders', 'clinicalMarkers', 'therapeuticGoals',
  'psychometricAssessments', 'consolidatedReports', 'clinicalReferrals', 'receipts', 'feeContracts',
  'teleconsultationRooms', 'transcriptionSessions', 'aiSoapDrafts', 'batchClosingManifests',
  'therapeuticExercises', 'diagnosticReports', 'psychiatricReferrals', 'patientAccessCodes',
  'passkeys', 'webauthnChallenges', 'dpiaReports', 'kmsState', 'liveTranscripts', 'leads', 'compliancePackages'
] as const satisfies readonly (keyof MemoryDatabase)[];

/** Persistência durável do cache de domínio no PostgreSQL (ADR-004) */
export const persistence = new EntityPersistence();
for (const name of MAP_COLLECTIONS) {
  persistence.register(mapSource(name, () => db[name] as TrackedMap<string, any>));
}
persistence.register(setSource('revokedTokens', () => db.revokedTokens));
persistence.register(appendOnlySource(
  'auditLogs',
  () => db.auditLogs,
  (list) => { db.auditLogs = list; },
  (log) => new Date(log.timestamp).getTime()
));
