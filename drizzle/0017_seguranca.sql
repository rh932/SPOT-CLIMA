CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_reset_at_idx" ON "rate_limits" USING btree ("reset_at");--> statement-breakpoint
-- Piso do limite de anonimato no próprio banco (mesmo valor de
-- MIN_ANONYMITY_THRESHOLD em src/lib/anonymity.ts). Pesquisas antigas abaixo
-- do piso sobem para ele antes do CHECK, senão a restrição não entra.
UPDATE "surveys" SET "anonymity_threshold" = 5 WHERE "anonymity_threshold" < 5;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_anonymity_threshold_min" CHECK ("anonymity_threshold" >= 5 AND "anonymity_threshold" <= 50);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Horário exato do envio é um identificador indireto (cruzado com a escala ou
-- com quem estava no tablet às 14h32). Respostas novas já gravam só o dia
-- (src/app/api/public/responses/route.ts); aqui as antigas perdem a hora.
-- Dia do calendário de São Paulo, guardado como meia-noite (mesmo formato
-- que saoPauloDay() usa no código). IRREVERSÍVEL de propósito.
UPDATE "survey_responses"
SET "created_at" = date_trunc('day', ("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')
WHERE "created_at" <> date_trunc('day', "created_at");
