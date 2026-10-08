DO $$ BEGIN
 CREATE TYPE "public"."shift" AS ENUM('DIA', 'NOITE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "scoped_shift" "shift";--> statement-breakpoint
ALTER TABLE "probationary_employees" ADD COLUMN "shift" "shift" DEFAULT 'DIA' NOT NULL;