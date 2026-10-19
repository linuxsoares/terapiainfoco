CREATE TABLE "anamnesis_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"encrypted_chief_complaint" jsonb NOT NULL,
	"encrypted_history_of_complaint" jsonb NOT NULL,
	"encrypted_biopsychosocial_history" jsonb NOT NULL,
	"encrypted_medical_and_psychiatric_history" jsonb NOT NULL,
	"encrypted_therapeutic_goals" jsonb NOT NULL,
	"encrypted_emergency_contact" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_record_rectifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinical_record_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
	"rectified_quadrant" varchar(30) NOT NULL,
	"encrypted_reason" jsonb NOT NULL,
	"encrypted_rectified_content" jsonb NOT NULL,
	"signature_hash" varchar(128) NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_store" (
	"collection" varchar(64) NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_store_collection_id_pk" PRIMARY KEY("collection","id")
);
--> statement-breakpoint
ALTER TABLE "anamnesis_records" ADD CONSTRAINT "anamnesis_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis_records" ADD CONSTRAINT "anamnesis_records_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_record_rectifications" ADD CONSTRAINT "clinical_record_rectifications_clinical_record_id_clinical_records_id_fk" FOREIGN KEY ("clinical_record_id") REFERENCES "public"."clinical_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_record_rectifications" ADD CONSTRAINT "clinical_record_rectifications_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anamnesis_patient" ON "anamnesis_records" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_rectifications_record" ON "clinical_record_rectifications" USING btree ("clinical_record_id");