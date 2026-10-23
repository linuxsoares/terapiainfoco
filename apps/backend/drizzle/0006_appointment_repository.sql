-- Remove FKs de/para "appointments" independentemente do nome: bancos criados pelo supabase_full_schema.sql
-- têm FKs inline nomeadas pelo Postgres (*_fkey), que os DROP CONSTRAINT abaixo não alcançam
-- e impedem a troca de tipo uuid → text (42804).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'f' AND (conrelid = '"appointments"'::regclass OR confrelid = '"appointments"'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_therapist_id_therapists_id_fk";
--> statement-breakpoint
ALTER TABLE "clinical_records" DROP CONSTRAINT IF EXISTS "clinical_records_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "session_transcriptions" DROP CONSTRAINT IF EXISTS "session_transcriptions_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "therapist_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "patient_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "sequence_number" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "total_in_series" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "recurrence_frequency" varchar(20);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reminder_status" varchar(20);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "last_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_appointments_patient" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_series" ON "appointments" USING btree ("series_id");--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "google_event_id";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "encrypted_meet_url";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "meet_access_code";