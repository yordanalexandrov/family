ALTER TABLE "meal_removal" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_removal" ADD COLUMN "to_recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_removal" ADD CONSTRAINT "meal_removal_to_recipe_id_recipe_id_fk" FOREIGN KEY ("to_recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;