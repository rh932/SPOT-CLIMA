CREATE TABLE IF NOT EXISTS "admin_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"shift" "shift" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_shifts" ADD CONSTRAINT "admin_shifts_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_shifts_admin_shift_idx" ON "admin_shifts" USING btree ("admin_id","shift");--> statement-breakpoint
-- Backfill: preserva o turno que hoje mora em admins.scoped_shift antes de a
-- coluna ser removida logo abaixo. Quem já é gestor continua com o mesmo
-- turno; dar o segundo turno a um Gestor Líder é decisão do ADM, na tela.
INSERT INTO "admin_shifts" ("id", "admin_id", "shift")
SELECT substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 24), "id", "scoped_shift"
FROM "admins" WHERE "scoped_shift" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "admins" DROP COLUMN IF EXISTS "scoped_shift";