CREATE TABLE IF NOT EXISTS "admin_sectors" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"sector_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "admins_scoped_sector_id_sectors_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_sectors" ADD CONSTRAINT "admin_sectors_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_sectors" ADD CONSTRAINT "admin_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sectors_admin_sector_idx" ON "admin_sectors" USING btree ("admin_id","sector_id");--> statement-breakpoint
-- Backfill: preserva o vínculo (gestor -> setor) que hoje mora em
-- admins.scoped_sector_id antes de a coluna ser removida logo abaixo.
INSERT INTO "admin_sectors" ("id", "admin_id", "sector_id")
SELECT substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 24), "id", "scoped_sector_id"
FROM "admins" WHERE "scoped_sector_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN IF EXISTS "scoped_sector_id";