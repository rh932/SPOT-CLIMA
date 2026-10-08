ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'EVALUATION_REMINDER';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'EVALUATION_SUBMITTED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TRAINING_CREATED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TRAINING_REOPENED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TRAINING_TYPE_CREATED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'EMPLOYEE_CREATED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'EMPLOYEE_UPDATED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'EMPLOYEE_REMOVED';--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COLOR_CHANGED';--> statement-breakpoint
DROP INDEX IF EXISTS "notifications_dedupe_idx";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "offset_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "actor_admin_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_idx" ON "notifications" USING btree ("admin_id","type","employee_id","due_date","offset_days");