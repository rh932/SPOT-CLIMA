CREATE TYPE "public"."questionnaire_form" AS ENUM('DESEMPENHO', 'FEEDBACK');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_question_status" AS ENUM('RASCUNHO', 'EM_ANALISE', 'APROVADA', 'REPROVADA', 'ARQUIVADA');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_question_type" AS ENUM('NOTA', 'SIM_NAO', 'TEXTO');--> statement-breakpoint
ALTER TYPE "public"."admin_role" ADD VALUE 'PJ';--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"sector_id" text NOT NULL,
	"form" "questionnaire_form" NOT NULL,
	"text" text NOT NULL,
	"type" "questionnaire_question_type" DEFAULT 'NOTA' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"status" "questionnaire_question_status" DEFAULT 'RASCUNHO' NOT NULL,
	"created_by_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "custom_answers" jsonb;--> statement-breakpoint
ALTER TABLE "sectors" ADD COLUMN "uses_feedback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_reviewed_by_id_admins_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questionnaire_questions_sector_form_idx" ON "questionnaire_questions" USING btree ("sector_id","form");--> statement-breakpoint
CREATE INDEX "questionnaire_questions_status_idx" ON "questionnaire_questions" USING btree ("status");--> statement-breakpoint
-- Feedback e cores passam a ser escolha do setor (antes, colaborador ATIVO participava em qualquer setor).
-- Para ninguém perder o que já usa: setor com colaborador ATIVO entra com cores, e todo setor com cores entra com feedback.
UPDATE "sectors" SET "uses_color_cycle" = true WHERE "id" IN (SELECT DISTINCT "sector_id" FROM "probationary_employees" WHERE "track" = 'ATIVO');--> statement-breakpoint
UPDATE "sectors" SET "uses_feedback" = true WHERE "uses_color_cycle" = true;
