CREATE TABLE "therapist_profiles" (
	"therapist_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"crp" varchar(20) NOT NULL,
	"crp_region" varchar(10) NOT NULL,
	"crp_verified" boolean DEFAULT false NOT NULL,
	"crp_verified_at" timestamp with time zone,
	"crp_verified_by" text,
	"published" boolean DEFAULT false NOT NULL,
	"headline" varchar(200),
	"bio" text,
	"approaches" text[] DEFAULT '{}'::text[] NOT NULL,
	"specialties" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"session_fee_cents" integer,
	"session_duration_minutes" integer DEFAULT 50 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_therapist_profiles_slug" ON "therapist_profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_therapist_profiles_search" ON "therapist_profiles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_therapist_profiles_listing" ON "therapist_profiles" USING btree ("published","crp_verified");