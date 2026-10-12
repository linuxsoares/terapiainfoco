CREATE TABLE "psychological_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"regulation_reference" varchar(100) DEFAULT 'Resolução CFP nº 006/2019' NOT NULL,
	"encrypted_content" jsonb NOT NULL,
	"pdf_storage_path" varchar(500),
	"validation_token" varchar(64) NOT NULL,
	"is_signed" boolean DEFAULT false NOT NULL,
	"signed_at" timestamp with time zone,
	"signature_pades_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psychological_documents_validation_token_unique" UNIQUE("validation_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'PSICOLOGO_TITULAR' NOT NULL,
	"crp" varchar(20),
	"crp_region" varchar(10),
	"therapist_id" uuid,
	"password_hash" text NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"two_factor_backup_codes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "session_transcriptions" ADD COLUMN "encrypted_transcript" jsonb;--> statement-breakpoint
ALTER TABLE "psychological_documents" ADD CONSTRAINT "psychological_documents_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psychological_documents" ADD CONSTRAINT "psychological_documents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_documents_patient" ON "psychological_documents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_documents_token" ON "psychological_documents" USING btree ("validation_token");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");