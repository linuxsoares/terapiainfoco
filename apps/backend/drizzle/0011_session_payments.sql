ALTER TABLE "appointments" ADD COLUMN "fee_cents" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "payment_status" varchar(20) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "paid_at" varchar(10);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "payment_method" varchar(20);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "encrypted_payer" jsonb;