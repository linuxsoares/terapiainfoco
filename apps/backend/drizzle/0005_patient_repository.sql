-- Remove FKs de/para "patients" independentemente do nome: bancos criados pelo supabase_full_schema.sql
-- têm FKs inline nomeadas pelo Postgres (*_fkey), que os DROP CONSTRAINT abaixo não alcançam
-- e impedem a troca de tipo uuid → text (42804).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'f' AND (conrelid = '"patients"'::regclass OR confrelid = '"patients"'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "anamnesis_records" DROP CONSTRAINT IF EXISTS "anamnesis_records_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE "clinical_records" DROP CONSTRAINT IF EXISTS "clinical_records_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_therapist_id_therapists_id_fk";
--> statement-breakpoint
ALTER TABLE "psychological_documents" DROP CONSTRAINT IF EXISTS "psychological_documents_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "therapist_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "linked_user_id" text;--> statement-breakpoint
CREATE INDEX "idx_patients_linked_user" ON "patients" USING btree ("linked_user_id");