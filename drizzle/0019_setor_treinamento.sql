ALTER TABLE "sectors" ADD COLUMN "in_training" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- O treinamento é do Salão: liga a chave nos setores do Salão existentes.
UPDATE "sectors" SET "in_training" = true WHERE "name" LIKE 'Salão%';
