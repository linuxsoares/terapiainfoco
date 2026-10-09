import { 
  pgTable, 
  uuid, 
  varchar, 
  text, 
  boolean, 
  timestamp, 
  integer, 
  jsonb, 
  index 
} from 'drizzle-orm/pg-core';
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
