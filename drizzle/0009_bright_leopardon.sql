DO $$ BEGIN
 CREATE TYPE "public"."training_result" AS ENUM('APROVADO', 'APROVADO_COM_RESSALVA', 'REPROVADO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "admin_role" ADD VALUE 'TREINADOR';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"training_type_id" text NOT NULL,
	"title" text NOT NULL,
	"image_data_uri" text,
	"instructions" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trainings" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"training_type_id" text NOT NULL,
	"trainer_admin_id" text,
	"training_date" timestamp NOT NULL,
	"result" "training_result" NOT NULL,
	"needs_reinforcement" boolean DEFAULT false NOT NULL,
	"reinforcement_notes" text,
	"observations" text,
	"employee_feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_training_type_id_training_types_id_fk" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trainings" ADD CONSTRAINT "trainings_employee_id_probationary_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."probationary_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trainings" ADD CONSTRAINT "trainings_training_type_id_training_types_id_fk" FOREIGN KEY ("training_type_id") REFERENCES "public"."training_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trainings" ADD CONSTRAINT "trainings_trainer_admin_id_admins_id_fk" FOREIGN KEY ("trainer_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_materials_type_idx" ON "training_materials" USING btree ("training_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_types_name_idx" ON "training_types" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trainings_employee_idx" ON "trainings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trainings_date_idx" ON "trainings" USING btree ("training_date");