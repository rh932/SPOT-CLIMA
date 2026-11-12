DO $$ BEGIN
 CREATE TYPE "public"."employee_status" AS ENUM('AWAITING_PERIOD_1', 'AWAITING_PERIOD_2', 'HIRED', 'TERMINATED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."evaluation_classification" AS ENUM('FRACO', 'ALGUMAS_POSSIBILIDADES', 'OTIMAS_PERSPECTIVAS', 'EXCELENTE_AQUISICAO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."evaluation_conclusion" AS ENUM('DEMITIR', 'EFETIVAR', 'EXTENDER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."evaluation_period" AS ENUM('FIRST', 'SECOND');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."evaluation_rating" AS ENUM('OTIMO', 'BOM', 'REGULAR', 'RUIM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "performance_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"period" "evaluation_period" NOT NULL,
	"evaluation_date" timestamp NOT NULL,
	"due_date_at_evaluation" timestamp NOT NULL,
	"evaluator_admin_id" text,
	"flexibility_rating" "evaluation_rating" NOT NULL,
	"flexibility_sub_answers" jsonb NOT NULL,
	"interest_rating" "evaluation_rating" NOT NULL,
	"interest_sub_answers" jsonb NOT NULL,
	"relationship_rating" "evaluation_rating" NOT NULL,
	"relationship_sub_answers" jsonb NOT NULL,
	"learning_rating" "evaluation_rating" NOT NULL,
	"learning_sub_answers" jsonb NOT NULL,
	"favorable_aspects" text NOT NULL,
	"unfavorable_aspects" text NOT NULL,
	"classification" "evaluation_classification" NOT NULL,
	"conclusion" "evaluation_conclusion" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "probationary_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"admission_date" timestamp NOT NULL,
	"role_description" text NOT NULL,
	"sector_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"period_1_due_date" timestamp NOT NULL,
	"period_2_due_date" timestamp NOT NULL,
	"status" "employee_status" DEFAULT 'AWAITING_PERIOD_1' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "scoped_unit_id" text;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "scoped_sector_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_employee_id_probationary_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."probationary_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "performance_evaluations" ADD CONSTRAINT "performance_evaluations_evaluator_admin_id_admins_id_fk" FOREIGN KEY ("evaluator_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "probationary_employees" ADD CONSTRAINT "probationary_employees_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "probationary_employees" ADD CONSTRAINT "probationary_employees_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "probationary_employees" ADD CONSTRAINT "probationary_employees_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "performance_evaluations_employee_id_idx" ON "performance_evaluations" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "performance_evaluations_employee_period_idx" ON "performance_evaluations" USING btree ("employee_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probationary_employees_sector_id_idx" ON "probationary_employees" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probationary_employees_unit_id_idx" ON "probationary_employees" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "probationary_employees_status_idx" ON "probationary_employees" USING btree ("status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admins" ADD CONSTRAINT "admins_scoped_unit_id_units_id_fk" FOREIGN KEY ("scoped_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admins" ADD CONSTRAINT "admins_scoped_sector_id_sectors_id_fk" FOREIGN KEY ("scoped_sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
