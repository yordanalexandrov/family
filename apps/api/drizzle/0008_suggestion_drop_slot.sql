ALTER TABLE "recipe_suggestion_request" DROP CONSTRAINT "recipe_suggestion_request_slot_check";--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" DROP COLUMN "slot";--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" DROP COLUMN "max_minutes";