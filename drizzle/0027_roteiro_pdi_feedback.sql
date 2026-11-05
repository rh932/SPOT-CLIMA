ALTER TABLE "performance_evaluations" ALTER COLUMN "flexibility_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "flexibility_sub_answers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "interest_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "interest_sub_answers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "relationship_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "relationship_sub_answers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "learning_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ALTER COLUMN "learning_sub_answers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performance_evaluations" ADD COLUMN "roteiro" jsonb;