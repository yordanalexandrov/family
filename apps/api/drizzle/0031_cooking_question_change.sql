ALTER TABLE "cooking_question_request" ADD COLUMN "change" jsonb;--> statement-breakpoint
ALTER TABLE "cooking_question_request" ADD COLUMN "applied_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;