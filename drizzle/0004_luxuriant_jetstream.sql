CREATE TABLE IF NOT EXISTS "admin_units" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" DROP CONSTRAINT "admins_scoped_unit_id_units_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_units" ADD CONSTRAINT "admin_units_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_units" ADD CONSTRAINT "admin_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_units_admin_unit_idx" ON "admin_units" USING btree ("admin_id","unit_id");--> statement-breakpoint
-- Backfill: preserva o vínculo (gestor -> unidade) que hoje mora em
-- admins.scoped_unit_id antes de a coluna ser removida logo abaixo.
INSERT INTO "admin_units" ("id", "admin_id", "unit_id")
SELECT substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 24), "id", "scoped_unit_id"
FROM "admins" WHERE "scoped_unit_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN IF EXISTS "scoped_unit_id";