DO $$ BEGIN
 CREATE TYPE "public"."notification_type" AS ENUM('FEEDBACK_REMINDER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"employee_id" text,
	"due_date" timestamp NOT NULL,
	"offset_days" integer NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_id_probationary_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."probationary_employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_admin_id_idx" ON "notifications" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_idx" ON "notifications" USING btree ("admin_id","employee_id","due_date","offset_days");