CREATE TABLE IF NOT EXISTS "units" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_plans" ADD COLUMN "unit_id" text;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "unit_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "units_name_idx" ON "units" USING btree ("name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_unit_id_idx" ON "survey_responses" USING btree ("unit_id");