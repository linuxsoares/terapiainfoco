import { 
  pgTable, 
  uuid, 
  varchar, 
  text, 
  boolean, 
  timestamp, 
  integer, 
  jsonb, 
  index,
  uniqueIndex,
  primaryKey,
  customType
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { EncryptedPayload } from '@terapiainfoco/shared';

/**
 * 1. TERAPEUTAS (RFC-001 §5.2)
 * Profissionais cadastrados e habilitados no e-Psi
 */
export const therapists = pgTable('therapists', {
  id: uuid('id').primaryKey().defaultRandom(),
  crp: varchar('crp', { length: 20 }).notNull().unique(),
  crpRegion: varchar('crp_region', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  /** DEK do terapeuta encriptada pela KEK mestre no Cloud KMS */
  encryptedDek: text('encrypted_dek').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * 2. PACIENTES COM FIELD-LEVEL ENCRYPTION E BLIND INDEXING (RFC §5.2, §4.1, §4.3)
 */
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id, { onDelete: 'restrict' }),

  /** Dados PII criptografados na camada de aplicação (AES-256-GCM) */
  encryptedName: jsonb('encrypted_name').$type<EncryptedPayload>().notNull(),
  encryptedEmail: jsonb('encrypted_email').$type<EncryptedPayload>().notNull(),
  encryptedPhone: jsonb('encrypted_phone').$type<EncryptedPayload>().notNull(),
  encryptedCpf: jsonb('encrypted_cpf').$type<EncryptedPayload>(),

  /** Blind Indexes para busca exata determinística sem expor texto claro (HMAC-SHA256) */
  emailBindex: varchar('email_bindex', { length: 64 }).notNull(),
  cpfBindex: varchar('cpf_bindex', { length: 64 }),

  consentTranscriptionSigned: boolean('consent_transcription_signed').notNull().default(false),
  consentSignedAt: timestamp('consent_signed_at', { withTimezone: true }),
  consentRevokedAt: timestamp('consent_revoked_at', { withTimezone: true }),
  consentRevokeReason: text('consent_revoke_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_patients_therapist').on(table.therapistId),
  index('idx_patients_email_bindex').on(table.emailBindex),
  index('idx_patients_cpf_bindex').on(table.cpfBindex)
]);

/**
 * 3. AGENDAMENTOS E SESSÕES (RFC §5.2, §3.1, §3.2)
 */
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
  scheduledEnd: timestamp('scheduled_end', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('CONFIRMED'),

  /** Integração Google Meet */
  googleEventId: varchar('google_event_id', { length: 255 }),
  encryptedMeetUrl: jsonb('encrypted_meet_url').$type<EncryptedPayload>().notNull(),
  meetAccessCode: varchar('meet_access_code', { length: 100 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_appointments_schedule').on(table.therapistId, table.scheduledStart)
]);

/**
 * 4. TRANSCRIÇÕES DE SESSÕES (RFC §5.2, §3.3)
 */
export const sessionTranscriptions = pgTable('session_transcriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointments.id),
  storagePath: varchar('storage_path', { length: 500 }).notNull(),
  encryptedStorageKey: text('encrypted_storage_key').notNull(),
  encryptedTranscript: jsonb('encrypted_transcript').$type<EncryptedPayload>(),
  rawStatus: varchar('raw_status', { length: 30 }).notNull().default('PENDING'),
  wordCount: integer('word_count'),
  durationSeconds: integer('duration_seconds'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});


/**
 * 5. PRONTUÁRIOS E EVOLUÇÃO CLÍNICA - SOAP (RFC §5.2, §3.4, CFP nº 001/2009)
 */
export const clinicalRecords = pgTable('clinical_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().references(() => appointments.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id),
  sessionNumber: integer('session_number').notNull(),

  /** Conteúdo SOAP Criptografado (AES-256-GCM) */
  encryptedSoapSubjective: jsonb('encrypted_soap_subjective').$type<EncryptedPayload>(),
  encryptedSoapObjective: jsonb('encrypted_soap_objective').$type<EncryptedPayload>(),
  encryptedSoapAssessment: jsonb('encrypted_soap_assessment').$type<EncryptedPayload>(),
  encryptedSoapPlan: jsonb('encrypted_soap_plan').$type<EncryptedPayload>(),

  /** Notas privadas do terapeuta segregadas do prontuário formal (§3.4) */
  encryptedPrivateNotes: jsonb('encrypted_private_notes').$type<EncryptedPayload>(),

  isSigned: boolean('is_signed').notNull().default(false),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signatureHash: varchar('signature_hash', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_clinical_records_patient').on(table.patientId, table.sessionNumber)
]);

/**
 * 6. AUDITORIA IMUTÁVEL DE ACESSO (RFC §5.2, §4.4)
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: uuid('resource_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull()
});

/**
 * 7. DOCUMENTOS PSICOLÓGICOS (RFC §5.2, Resolução CFP nº 006/2019)
 */
export const psychologicalDocuments = pgTable('psychological_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  type: varchar('type', { length: 30 }).notNull(), // DECLARACAO, ATESTADO, RELATORIO, LAUDO
  title: varchar('title', { length: 255 }).notNull(),
  regulationReference: varchar('regulation_reference', { length: 100 }).notNull().default('Resolução CFP nº 006/2019'),

  /** Conteúdo textual protegido por Field-Level Encryption (AES-256-GCM) */
  encryptedContent: jsonb('encrypted_content').$type<EncryptedPayload>().notNull(),
  pdfStoragePath: varchar('pdf_storage_path', { length: 500 }),

  /** Token criptográfico público para verificação via QR Code */
  validationToken: varchar('validation_token', { length: 64 }).notNull().unique(),

  isSigned: boolean('is_signed').notNull().default(false),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signaturePadesHash: varchar('signature_pades_hash', { length: 128 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_documents_patient').on(table.patientId),
  index('idx_documents_token').on(table.validationToken)
]);

/**
 * 8. USUÁRIOS E AUTENTICAÇÃO SEGURA (RFC §5.2, Opção C)
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('PSICOLOGO_TITULAR'),
  crp: varchar('crp', { length: 20 }),
  crpRegion: varchar('crp_region', { length: 10 }),
  therapistId: uuid('therapist_id').references(() => therapists.id),
  passwordHash: text('password_hash').notNull(),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  twoFactorBackupCodes: jsonb('two_factor_backup_codes').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true })
}, (table) => [
  index('idx_users_email').on(table.email)
]);

/**
 * 9. FICHA DE ADMISSÃO & ANAMNESE BIOPSICOSSOCIAL (RFC §3.4, CFP nº 001/2009)
 */
export const anamnesisRecords = pgTable('anamnesis_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id),
  version: integer('version').notNull().default(1),

  /** Queixa Principal e Histórico da Demanda Criptografados (AES-256-GCM) */
  encryptedChiefComplaint: jsonb('encrypted_chief_complaint').$type<EncryptedPayload>().notNull(),
  encryptedHistoryOfComplaint: jsonb('encrypted_history_of_complaint').$type<EncryptedPayload>().notNull(),

  /** Histórico Biopsicossocial Criptografado */
  encryptedBiopsychosocialHistory: jsonb('encrypted_biopsychosocial_history').$type<EncryptedPayload>().notNull(),

  /** Histórico Médico, Psiquiátrico e Medicamentoso Criptografado */
  encryptedMedicalAndPsychiatricHistory: jsonb('encrypted_medical_and_psychiatric_history').$type<EncryptedPayload>().notNull(),

  /** Objetivos Terapêuticos Criptografados */
  encryptedTherapeuticGoals: jsonb('encrypted_therapeutic_goals').$type<EncryptedPayload>().notNull(),

  /** Contato de Emergência Criptografado */
  encryptedEmergencyContact: jsonb('encrypted_emergency_contact').$type<EncryptedPayload>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_anamnesis_patient').on(table.patientId)
]);

/**
 * 10. TERMOS DE RETIFICAÇÃO FORMAL DE PRONTUÁRIO (RFC §3.4, CFP nº 001/2009)
 */
export const clinicalRecordRectifications = pgTable('clinical_record_rectifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  clinicalRecordId: uuid('clinical_record_id').notNull().references(() => clinicalRecords.id, { onDelete: 'cascade' }),
  therapistId: uuid('therapist_id').notNull().references(() => therapists.id),
  rectifiedQuadrant: varchar('rectified_quadrant', { length: 30 }).notNull(),

  /** Motivação formal e conteúdo aditivo criptografados com AES-256-GCM */
  encryptedReason: jsonb('encrypted_reason').$type<EncryptedPayload>().notNull(),
  encryptedRectifiedContent: jsonb('encrypted_rectified_content').$type<EncryptedPayload>().notNull(),

  /** Assinatura digital e hash canônico do termo de retificação */
  signatureHash: varchar('signature_hash', { length: 128 }).notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_rectifications_record').on(table.clinicalRecordId)
]);

/**
 * 11. ARMAZENAMENTO DURÁVEL DAS COLEÇÕES DE DOMÍNIO (ADR-004)
 * Cada entidade do cache de domínio é persistida como documento JSONB, preservando
 * os campos cifrados (FLE) exatamente como estão em memória.
 */
export const entityStore = pgTable('entity_store', {
  collection: varchar('collection', { length: 64 }).notNull(),
  id: text('id').notNull(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  primaryKey({ columns: [table.collection, table.id] })
]);

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector'
});

/**
 * 12. PERFIS PÚBLICOS DE PSICÓLOGOS & BUSCA (RFC-001 §3.1, ADR-004 fase 2)
 * Dados profissionais públicos (não sensíveis). Só aparecem na busca perfis publicados
 * pelo psicólogo e com CRP verificado por um administrador.
 */
export const therapistProfiles = pgTable('therapist_profiles', {
  therapistId: text('therapist_id').primaryKey(),
  userId: text('user_id').notNull(),
  slug: varchar('slug', { length: 120 }).notNull(),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  crp: varchar('crp', { length: 20 }).notNull(),
  crpRegion: varchar('crp_region', { length: 10 }).notNull(),
  crpVerified: boolean('crp_verified').notNull().default(false),
  crpVerifiedAt: timestamp('crp_verified_at', { withTimezone: true }),
  crpVerifiedBy: text('crp_verified_by'),
  published: boolean('published').notNull().default(false),
  headline: varchar('headline', { length: 200 }),
  bio: text('bio'),
  approaches: text('approaches').array().notNull().default(sql`'{}'::text[]`),
  specialties: text('specialties').array().notNull().default(sql`'{}'::text[]`),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  sessionFeeCents: integer('session_fee_cents'),
  sessionDurationMinutes: integer('session_duration_minutes').notNull().default(50),
  /** Texto normalizado (minúsculas, sem acentos) mantido pela aplicação para a busca */
  searchText: text('search_text').notNull().default(''),
  searchVector: tsvector('search_vector').generatedAlwaysAs(sql`to_tsvector('simple', search_text)`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  uniqueIndex('uq_therapist_profiles_slug').on(table.slug),
  index('idx_therapist_profiles_search').using('gin', table.searchVector),
  index('idx_therapist_profiles_listing').on(table.published, table.crpVerified)
]);
