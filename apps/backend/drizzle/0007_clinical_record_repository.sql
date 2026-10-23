-- Remove FKs de/para "clinical_records" independentemente do nome: bancos criados pelo supabase_full_schema.sql
-- têm FKs inline nomeadas pelo Postgres (*_fkey), que os DROP CONSTRAINT abaixo não alcançam
-- e impedem a troca de tipo uuid → text (42804).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'f' AND (conrelid = '"clinical_records"'::regclass OR confrelid = '"clinical_records"'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "clinical_record_rectifications" DROP CONSTRAINT IF EXISTS "clinical_record_rectifications_clinical_record_id_clinical_records_id_fk";
--> statement-breakpoint
ALTER TABLE "clinical_records" DROP CONSTRAINT IF EXISTS "clinical_records_therapist_id_therapists_id_fk";
--> statement-breakpoint
ALTER TABLE "clinical_records" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "clinical_records" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "clinical_records" ALTER COLUMN "appointment_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "clinical_records" ALTER COLUMN "patient_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "clinical_records" ALTER COLUMN "therapist_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD COLUMN "batch_closing_manifest_id" text;--> statement-breakpoint
CREATE INDEX "idx_clinical_records_therapist" ON "clinical_records" USING btree ("therapist_id");--> statement-breakpoint
CREATE INDEX "idx_clinical_records_appointment" ON "clinical_records" USING btree ("appointment_id");