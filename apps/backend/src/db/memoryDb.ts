import type {
  Therapist,
  StoredPatient,
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
  public anamnesisRecords: Map<string, StoredAnamnesisRecord> = new Map();
  public clinicalRecordRectifications: Map<string, StoredClinicalRecordRectification> = new Map();
  public reminders: Map<string, StoredAppointmentReminder> = new Map();
  public clinicalMarkers: Map<string, StoredClinicalSessionMarker> = new Map();
  public therapeuticGoals: Map<string, StoredTherapeuticGoal> = new Map();
  public psychometricAssessments: Map<string, PsychometricAssessment> = new Map();
  public consolidatedReports: Map<string, StoredConsolidatedClinicalReport> = new Map();
  public clinicalReferrals: Map<string, StoredClinicalReferral> = new Map();
  public receipts: Map<string, StoredClinicalReceipt> = new Map();
  public feeContracts: Map<string, StoredFeeContract> = new Map();
  public teleconsultationRooms: Map<string, StoredTeleconsultationRoom> = new Map();
  public transcriptionSessions: Map<string, StoredTranscriptionSession> = new Map();
  public aiSoapDrafts: Map<string, AiSoapDraft> = new Map();
  public batchClosingManifests: Map<string, IcpBatchClosingManifest> = new Map();
  public therapeuticExercises: Map<string, TherapeuticExercise> = new Map();
  public diagnosticReports: Map<string, DiagnosticAssessmentReport> = new Map();
  public psychiatricReferrals: Map<string, PsychiatricReferralGuide> = new Map();
  public patientAccessCodes: Map<string, { code: string; patientId: string; expiresAt: Date }> = new Map();
  public users: Map<string, User> = new Map();
  public revokedTokens: Set<string> = new Set();
  public auditLogs: AuditLog[] = [];
  public passkeys: Map<string, PasskeyCredential> = new Map();
  public webauthnChallenges: Map<string, WebAuthnChallengeSession> = new Map();
  public dpiaReports: Map<string, DPIAReport> = new Map();


  constructor() {
    this.seedDefaultTherapist();
    this.seedDefaultUsers();
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

  public seedDefaultUsers() {
    // Hash padrão de teste com Argon2id para "Senha@123456"
    const defaultPasswordHash = Bun.password.hashSync('Senha@123456');

    // 1. Psicóloga Titular (Responsável Técnica - CFP 001/2009)
    const psicologoUser: User = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'psicologo@terapiainfoco.com.br',
      name: 'Dra. Beatriz Santos',
      role: UserRole.PSICOLOGO_TITULAR,
      crp: '06/142980',
      crpRegion: 'SP',
      therapistId: 'therapist-001',
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(psicologoUser.id, psicologoUser);

    // 2. Supervisor Clínico (Acesso de Supervisão/Estágio)
    const supervisorUser: User = {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'supervisor@terapiainfoco.com.br',
      name: 'Dr. Marcos Valente',
      role: UserRole.SUPERVISOR_CLINICO,
      crp: '06/099887',
      crpRegion: 'SP',
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(supervisorUser.id, supervisorUser);

    // 3. Recepção / Secretária (Acesso estrito à Agenda e Contato, sem prontuários)
    const recepcaoUser: User = {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'recepcao@terapiainfoco.com.br',
      name: 'Ana Secretária',
      role: UserRole.RECEPCAO_SECRETARIA,
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(recepcaoUser.id, recepcaoUser);

    // 4. Administrador de TI / Segurança
    const adminUser: User = {
      id: '00000000-0000-0000-0000-000000000004',
      email: 'admin@terapiainfoco.com.br',
      name: 'Administrador do Sistema',
      role: UserRole.ADMIN,
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(adminUser.id, adminUser);
  }

  clear() {
    this.patients.clear();
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
    this.seedDefaultTherapist();
    this.seedDefaultUsers();
  }
}


export const db = new MemoryDatabase();
