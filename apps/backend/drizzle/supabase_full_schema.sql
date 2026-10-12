-- ==============================================================================
-- TerapiaInFoco (RFC-001) — Schema Completo para Supabase PostgreSQL
-- Execute este script no SQL Editor do painel do Supabase se desejar criar
-- as tabelas manualmente de uma só vez.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TERAPEUTAS
CREATE TABLE IF NOT EXISTS "therapists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crp" varchar(20) NOT NULL UNIQUE,
	"crp_region" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"encrypted_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. USUÁRIOS
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"name" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'PSICOLOGO_TITULAR' NOT NULL,
	"crp" varchar(20),
	"crp_region" varchar(10),
	"therapist_id" uuid REFERENCES "therapists"("id"),
	"password_hash" text NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"two_factor_backup_codes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");

-- 3. PACIENTES COM FIELD-LEVEL ENCRYPTION E BLIND INDEXING
CREATE TABLE IF NOT EXISTS "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL REFERENCES "therapists"("id") ON DELETE RESTRICT,
	"encrypted_name" jsonb NOT NULL,
	"encrypted_email" jsonb NOT NULL,
	"encrypted_phone" jsonb NOT NULL,
	"encrypted_cpf" jsonb,
	"email_bindex" varchar(64) NOT NULL,
	"cpf_bindex" varchar(64),
	"consent_transcription_signed" boolean DEFAULT false NOT NULL,
	"consent_signed_at" timestamp with time zone,
	"consent_revoked_at" timestamp with time zone,
	"consent_revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_patients_therapist" ON "patients" ("therapist_id");
CREATE INDEX IF NOT EXISTS "idx_patients_email_bindex" ON "patients" ("email_bindex");
CREATE INDEX IF NOT EXISTS "idx_patients_cpf_bindex" ON "patients" ("cpf_bindex");

-- 4. AGENDAMENTOS E TELECONSULTAS
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL REFERENCES "therapists"("id"),
	"patient_id" uuid NOT NULL REFERENCES "patients"("id"),
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" varchar(30) DEFAULT 'CONFIRMED' NOT NULL,
	"google_event_id" varchar(255),
	"encrypted_meet_url" jsonb NOT NULL,
	"meet_access_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_appointments_schedule" ON "appointments" ("therapist_id", "scheduled_start");

-- 5. TRANSCRIÇÕES DE SESSÕES
CREATE TABLE IF NOT EXISTS "session_transcriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL UNIQUE REFERENCES "appointments"("id"),
	"storage_path" varchar(500) NOT NULL,
	"encrypted_storage_key" text NOT NULL,
	"encrypted_transcript" jsonb,
	"raw_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"word_count" integer,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. PRONTUÁRIOS CLÍNICOS E EVOLUÇÃO SOAP (CFP 001/2009)
CREATE TABLE IF NOT EXISTS "clinical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL REFERENCES "appointments"("id"),
	"patient_id" uuid NOT NULL REFERENCES "patients"("id"),
	"therapist_id" uuid NOT NULL REFERENCES "therapists"("id"),
	"session_number" integer NOT NULL,
	"encrypted_soap_subjective" jsonb,
	"encrypted_soap_objective" jsonb,
	"encrypted_soap_assessment" jsonb,
	"encrypted_soap_plan" jsonb,
	"encrypted_private_notes" jsonb,
	"is_signed" boolean DEFAULT false NOT NULL,
	"signed_at" timestamp with time zone,
	"signature_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_clinical_records_patient" ON "clinical_records" ("patient_id", "session_number");

-- 7. DOCUMENTOS PSICOLÓGICOS (CFP 006/2019)
CREATE TABLE IF NOT EXISTS "psychological_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL REFERENCES "therapists"("id"),
	"patient_id" uuid NOT NULL REFERENCES "patients"("id"),
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"regulation_reference" varchar(100) DEFAULT 'Resolução CFP nº 006/2019' NOT NULL,
	"encrypted_content" jsonb NOT NULL,
	"pdf_storage_path" varchar(500),
	"validation_token" varchar(64) NOT NULL UNIQUE,
	"is_signed" boolean DEFAULT false NOT NULL,
	"signed_at" timestamp with time zone,
	"signature_pades_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_documents_patient" ON "psychological_documents" ("patient_id");
CREATE INDEX IF NOT EXISTS "idx_documents_token" ON "psychological_documents" ("validation_token");

-- 8. TRILHA DE AUDITORIA WORM
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);

-- SEED: TERAPEUTA E USUÁRIO PADRÃO
INSERT INTO "therapists" ("id", "crp", "crp_region", "status", "encrypted_dek")
VALUES ('00000000-0000-0000-0000-000000000001', '06/142980', 'SP', 'ACTIVE', 'mock-encrypted-dek-base64')
ON CONFLICT ("id") DO NOTHING;
