DO $$ BEGIN
 CREATE TYPE "public"."training_closure" AS ENUM('DIA', 'DEFINITIVO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "sectors" ADD COLUMN "uses_color_cycle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "closure" "training_closure" DEFAULT 'DIA' NOT NULL;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "reopened_at" timestamp;--> statement-breakpoint
ALTER TABLE "trainings" ADD COLUMN "reopened_by_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trainings" ADD CONSTRAINT "trainings_reopened_by_id_admins_id_fk" FOREIGN KEY ("reopened_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trainings_definitivo_employee_type_idx" ON "trainings" USING btree ("employee_id","training_type_id") WHERE "trainings"."closure" = 'DEFINITIVO';--> statement-breakpoint
-- Liga o ciclo de cores nos setores do Salao (hoje "Salao - Bar" e
-- "Salao - Atendimento"). O projeto das cores e do Salao; os demais setores
-- ficam com a chave desligada e efetivam sem cor. Depois disto quem manda e o
-- cadastro de Setores no painel do RH, nao o nome do setor.
-- O regex '^sal.o' evita depender do acento no arquivo: o ponto casa tanto o
-- "a" de Salao quanto o "a-til" de Salao com acento.
UPDATE "sectors" SET "uses_color_cycle" = true WHERE "name" ~* '^sal.o';
