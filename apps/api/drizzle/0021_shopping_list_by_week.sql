-- The shopping list is addressed by its week (#151, D-11): a week without a menu has a list too, for its manual
-- items, and `plan_id` is the week's menu once there is one. The existing lists take the week of their plan; a
-- deleted plan now leaves its list (`set null`) instead of deleting it.
ALTER TABLE "shopping_list" DROP CONSTRAINT "shopping_list_plan_id_meal_plan_id_fk";
--> statement-breakpoint
ALTER TABLE "shopping_list" ALTER COLUMN "plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD COLUMN "week_start" date;--> statement-breakpoint
UPDATE "shopping_list" SET "week_start" = "meal_plan"."week_start" FROM "meal_plan" WHERE "meal_plan"."id" = "shopping_list"."plan_id";--> statement-breakpoint
ALTER TABLE "shopping_list" ALTER COLUMN "week_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_week_start_unique" UNIQUE("week_start");
