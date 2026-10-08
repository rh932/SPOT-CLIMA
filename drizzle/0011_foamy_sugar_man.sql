DO $$ BEGIN
 CREATE TYPE "public"."feedback_color" AS ENUM('VERMELHO', 'AMARELO', 'VERDE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "evaluation_period" ADD VALUE 'FEEDBACK';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_color_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"evaluation_id" text,
	"previous_color" "feedback_color",
	"new_color" "feedback_color" NOT NULL,
	"reason" text NOT NULL,
	"next_due_date" timestamp NOT NULL,
	"changed_by_admin_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "performance_evaluations_employee_period_idx";--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "conclusion" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "cycle_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "color" "feedback_color";--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "next_due_date" timestamp;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "development_points" text;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "guidance" text;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "training_needs" text;--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "current_color" "feedback_color";--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "next_feedback_due_date" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_color_changes" ADD CONSTRAINT "employee_color_changes_employee_id_probationary_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."probationary_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_color_changes" ADD CONSTRAINT "employee_color_changes_evaluation_id_performance_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."performance_evaluations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_color_changes" ADD CONSTRAINT "employee_color_changes_changed_by_admin_id_admins_id_fk" FOREIGN KEY ("changed_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_color_changes_employee_id_idx" ON "employee_color_changes" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_color_changes_created_at_idx" ON "employee_color_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probationary_employees_next_feedback_due_date_idx" ON "probationary_employees" USING btree ("next_feedback_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "performance_evaluations_employee_period_idx" ON "performance_evaluations" USING btree ("employee_id","period","cycle_number");