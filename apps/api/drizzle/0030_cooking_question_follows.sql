ALTER TABLE "cooking_question_request" ADD COLUMN "follows_id" uuid;--> statement-breakpoint
ALTER TABLE "cooking_question_request" ADD COLUMN "chain_id" uuid;--> statement-breakpoint
-- Every question asked so far is the first of its own chain.
UPDATE "cooking_question_request" SET "chain_id" = "id";--> statement-breakpoint
ALTER TABLE "cooking_question_request" ALTER COLUMN "chain_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cooking_question_request" ADD CONSTRAINT "cooking_question_request_follows_id_cooking_question_request_id_fk" FOREIGN KEY ("follows_id") REFERENCES "public"."cooking_question_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cooking_question_request_pending_chain_key" ON "cooking_question_request" USING btree ("chain_id") WHERE "cooking_question_request"."status" = 'pending';