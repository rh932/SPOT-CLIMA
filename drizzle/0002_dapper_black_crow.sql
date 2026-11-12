ALTER TYPE "question_type" ADD VALUE 'SCALE';--> statement-breakpoint
ALTER TYPE "question_type" ADD VALUE 'YES_NO';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"duplicated_from_template_id" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_question_options" (
	"id" text PRIMARY KEY NOT NULL,
	"template_question_id" text NOT NULL,
	"label" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"dimension_id" text,
	"text" text NOT NULL,
	"type" "question_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"scale_min" integer,
	"scale_max" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_min" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_max" integer;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "source_template_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_category_id_template_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."template_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_templates" ADD CONSTRAINT "question_templates_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_question_options" ADD CONSTRAINT "template_question_options_template_question_id_template_questions_id_fk" FOREIGN KEY ("template_question_id") REFERENCES "public"."template_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_questions" ADD CONSTRAINT "template_questions_template_id_question_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."question_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_questions" ADD CONSTRAINT "template_questions_dimension_id_dimensions_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_templates_category_id_idx" ON "question_templates" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "template_categories_name_idx" ON "template_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_question_options_template_question_id_idx" ON "template_question_options" USING btree ("template_question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_questions_template_id_idx" ON "template_questions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_questions_dimension_id_idx" ON "template_questions" USING btree ("dimension_id");