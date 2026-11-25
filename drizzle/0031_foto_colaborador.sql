CREATE TABLE "employee_photos" (
	"employee_id" text PRIMARY KEY NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"data" "bytea" NOT NULL,
	"source" text DEFAULT 'CONVENIA' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_photos" ADD CONSTRAINT "employee_photos_employee_id_probationary_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."probationary_employees"("id") ON DELETE cascade ON UPDATE no action;