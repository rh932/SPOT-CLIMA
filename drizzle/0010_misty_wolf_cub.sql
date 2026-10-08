DO $$ BEGIN
 CREATE TYPE "public"."training_rating" AS ENUM('RUIM', 'MEDIO', 'BOM', 'OTIMO', 'NAO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"training_id" text NOT NULL,
	"criterion_id" text NOT NULL,
	"rating" "training_rating" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_criteria" (
	"id" text PRIMARY KEY NOT NULL,
	"training_type_id" text NOT NULL,
	"label" text NOT NULL,
	"hint" text,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_types" ADD COLUMN "context_fields" jsonb;--> statement-breakpoint
ALTER TABLE "training_types" ADD COLUMN "rating_options" jsonb;--> statement-breakpoint
ALTER TABLE "training_types" ADD COLUMN "positive_label" text;--> statement-breakpoint
ALTER TABLE "training_types" ADD COLUMN "negative_label" text;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "positive_points" text;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "negative_points" text;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "context_values" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_answers" ADD CONSTRAINT "training_answers_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_answers" ADD CONSTRAINT "training_answers_criterion_id_training_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."training_criteria"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_criteria" ADD CONSTRAINT "training_criteria_training_type_id_training_types_id_fk" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_answers_training_idx" ON "training_answers" USING btree ("training_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_answers_training_criterion_idx" ON "training_answers" USING btree ("training_id","criterion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_criteria_type_idx" ON "training_criteria" USING btree ("training_type_id");