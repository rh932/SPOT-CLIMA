DO $$ BEGIN
 CREATE TYPE "public"."evaluation_source" AS ENUM('SISTEMA', 'FORMS');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."termination_reason" AS ENUM('DISPENSA_EXPERIENCIA', 'PEDIDO_DEMISSAO', 'DEMISSAO_SEM_JUSTA_CAUSA', 'JUSTA_CAUSA', 'ABANDONO_EMPREGO', 'ACORDO_MUTUO', 'FIM_APRENDIZAGEM', 'CONTRATACAO_CANCELADA', 'FALECIMENTO', 'OUTRO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "evaluator_name" text;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "source" "evaluation_source" DEFAULT 'SISTEMA' NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "is_apprentice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "termination_reason" "termination_reason";--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "termination_date" timestamp;--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "termination_notes" text;--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "previous_status" "employee_status";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "performance_evaluations_external_id_idx" ON "performance_evaluations" USING btree ("external_id");