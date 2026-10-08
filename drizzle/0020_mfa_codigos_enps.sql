CREATE TABLE IF NOT EXISTS "survey_access_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"survey_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"batch" integer DEFAULT 1 NOT NULL,
	"used_on" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mfa_pending_secret" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mfa_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mfa_last_step" integer;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "mfa_recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "is_enps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "require_access_code" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_questions" ADD COLUMN "is_enps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_access_codes" ADD CONSTRAINT "survey_access_codes_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "survey_access_codes_code_hash_idx" ON "survey_access_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_access_codes_survey_id_idx" ON "survey_access_codes" USING btree ("survey_id");