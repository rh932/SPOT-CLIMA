CREATE TYPE "public"."employee_track" AS ENUM('NOVO', 'ATIVO');--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "track" "employee_track" DEFAULT 'NOVO' NOT NULL;