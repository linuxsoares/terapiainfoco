CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" varchar(30) DEFAULT 'CONFIRMED' NOT NULL,
	"google_event_id" varchar(255),
	"encrypted_meet_url" jsonb NOT NULL,
	"meet_access_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL,
	"encrypted_name" jsonb NOT NULL,
	"encrypted_email" jsonb NOT NULL,
	"encrypted_phone" jsonb NOT NULL,
	"encrypted_cpf" jsonb,
	"email_bindex" varchar(64) NOT NULL,
	"cpf_bindex" varchar(64),
	"consent_transcription_signed" boolean DEFAULT false NOT NULL,
	"consent_signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_transcriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"storage_path" varchar(500) NOT NULL,
	"encrypted_storage_key" text NOT NULL,
	"raw_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"word_count" integer,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_transcriptions_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "therapists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crp" varchar(20) NOT NULL,
	"crp_region" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"encrypted_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "therapists_crp_unique" UNIQUE("crp")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcriptions" ADD CONSTRAINT "session_transcriptions_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_appointments_schedule" ON "appointments" USING btree ("therapist_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "idx_clinical_records_patient" ON "clinical_records" USING btree ("patient_id","session_number");--> statement-breakpoint
CREATE INDEX "idx_patients_therapist" ON "patients" USING btree ("therapist_id");--> statement-breakpoint
CREATE INDEX "idx_patients_email_bindex" ON "patients" USING btree ("email_bindex");--> statement-breakpoint
CREATE INDEX "idx_patients_cpf_bindex" ON "patients" USING btree ("cpf_bindex");