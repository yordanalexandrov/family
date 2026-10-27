ALTER TABLE "recipe" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_rating_check" CHECK ("recipe"."rating" between 1 and 5);