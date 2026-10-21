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