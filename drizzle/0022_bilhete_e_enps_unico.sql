CREATE TABLE "survey_ticket_uses" (
	"ticket_hash" text PRIMARY KEY NOT NULL,
	"survey_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_ticket_uses" ADD CONSTRAINT "survey_ticket_uses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "questions_enps_ativa_por_pesquisa_idx" ON "questions" USING btree ("survey_id") WHERE "questions"."is_enps" AND "questions"."active";