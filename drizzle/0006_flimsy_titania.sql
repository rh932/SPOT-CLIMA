ALTER TYPE "admin_role" ADD VALUE 'GESTOR_LIDER';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "admin_role" NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_key_idx" ON "role_permissions" USING btree ("role","permission_key");