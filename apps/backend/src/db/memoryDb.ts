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
  StoredLiveTranscript,
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
import type { LocalKmsState } from '@terapiainfoco/crypto';
import { config } from '../config';
import { EntityPersistence, TrackedMap, TrackedSet, mapSource, setSource, appendOnlySource } from './persistence';

/**
 * Banco em memória representando os esquemas relacionais da RFC-001 §5.2
 * Permite isolamento em testes e execução local instantânea com Bun
 */
export class MemoryDatabase {
  public therapists: TrackedMap<string, Therapist> = new TrackedMap();
  public patients: TrackedMap<string, StoredPatient> = new TrackedMap();
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
  public users: TrackedMap<string, User> = new TrackedMap();
  public revokedTokens: TrackedSet<string> = new TrackedSet();
  public auditLogs: AuditLog[] = [];
  public passkeys: TrackedMap<string, PasskeyCredential> = new TrackedMap();
  public webauthnChallenges: TrackedMap<string, WebAuthnChallengeSession> = new TrackedMap();
  public dpiaReports: TrackedMap<string, DPIAReport> = new TrackedMap();
  /** Estado do KMS local (versão ativa e revogações de KEK), persistido para sobreviver a restarts */
  public kmsState: TrackedMap<string, LocalKmsState> = new TrackedMap();
  /** Transcrição das teleconsultas (texto cifrado; o áudio nunca é armazenado) */
  public liveTranscripts: TrackedMap<string, StoredLiveTranscript> = new TrackedMap();


  constructor() {
    if (config.demoMode) {
      this.seedDefaultTherapist();
      this.seedDefaultUsers();
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
      phone: '(11) 99123-4567',
      specialty: 'Terapia Cognitivo-Comportamental (TCC) & ACT',
      bio: 'Psicóloga Clínica (USP), Especialista em Transtornos de Ansiedade, Neuropsicologia e Telepsicologia Ética (CFP nº 011/2018).',
      sessionFeeCents: 25000,
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'GOV_BR' as any],
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
      therapistId: 'therapist-001',
      crp: '06/099887',
      crpRegion: 'SP',
      specialty: 'Supervisão Clínica & Psicopatologia (CID-11)',
      socialProviders: ['EMAIL_PASSWORD' as any],
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
      therapistId: 'therapist-001',
      socialProviders: ['EMAIL_PASSWORD' as any],
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(recepcaoUser.id, recepcaoUser);

    // 4. Administrador de TI / Segurança & DPO
    const adminUser: User = {
      id: '00000000-0000-0000-0000-000000000004',
      email: 'admin@terapiainfoco.com.br',
      name: 'Administrador do Sistema',
      role: UserRole.ADMIN,
      phone: '(11) 99888-7766',
      department: 'Engenharia de Segurança, Criptografia KMS & Governança LGPD',
      dpoCertification: 'CDPO/BR • ISO/IEC 27701 & ANPD Resolução nº 15/2024',
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'PASSKEY_FIDO2' as any],
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(adminUser.id, adminUser);

    // 5. Paciente Titular (Portal do Paciente, Exercícios TCC/ACT/DBT, Recibos & Cofre .enc LGPD Art. 18)
    const pacienteUser: User = {
      id: '00000000-0000-0000-0000-000000000005',
      email: 'paciente@terapiainfoco.com.br',
      name: 'Mariana Silva de Oliveira',
      role: UserRole.PACIENTE,
      patientId: '00000000-0000-0000-0000-000000000002',
      therapistId: 'therapist-001',
      phone: '(11) 98765-4321',
      cpfMasked: '***.456.789-**',
      emergencyContactName: 'Carlos Oliveira (Cônjuge)',
      emergencyContactPhone: '(11) 97654-3210',
      socialProviders: ['EMAIL_PASSWORD' as any, 'GOOGLE' as any, 'APPLE' as any],
      passwordHash: defaultPasswordHash,
      twoFactorEnabled: false,
      createdAt: new Date()
    };
    this.users.set(pacienteUser.id, pacienteUser);
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
    this.liveTranscripts.clear();
    this.seedDefaultTherapist();
    this.seedDefaultUsers();
  }
}


export const db = new MemoryDatabase();

/** Nomes das coleções chave-valor do cache de domínio persistidas no entity_store */
const MAP_COLLECTIONS = [
  'therapists', 'patients', 'appointments', 'clinicalRecords', 'documents', 'sessionTranscriptions',
  'anamnesisRecords', 'clinicalRecordRectifications', 'reminders', 'clinicalMarkers', 'therapeuticGoals',
  'psychometricAssessments', 'consolidatedReports', 'clinicalReferrals', 'receipts', 'feeContracts',
  'teleconsultationRooms', 'transcriptionSessions', 'aiSoapDrafts', 'batchClosingManifests',
  'therapeuticExercises', 'diagnosticReports', 'psychiatricReferrals', 'patientAccessCodes', 'users',
  'passkeys', 'webauthnChallenges', 'dpiaReports', 'kmsState', 'liveTranscripts'
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
