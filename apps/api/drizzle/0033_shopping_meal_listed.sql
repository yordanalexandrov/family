-- Meals join the shopping list by hand (#301, ADR-0011). The lists up to this week (in Sofia) keep what they summed:
-- every meal of their menu with a recipe is added to them, and a week up to now with a menu but a list nothing was
-- written to gets one, so its list does not change either. The later weeks start without meals.
-- Idempotent (`on conflict do nothing`), so it can run again over rows already added.
INSERT INTO "shopping_list" ("week_start", "plan_id")
SELECT "meal_plan"."week_start", "meal_plan"."id" FROM "meal_plan"
WHERE "meal_plan"."week_start" <= date_trunc('week', now() AT TIME ZONE 'Europe/Sofia')::date
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "shopping_meal" ("list_id", "meal_id")
SELECT "shopping_list"."id", "meal"."id" FROM "shopping_list"
JOIN "meal_plan" ON "meal_plan"."week_start" = "shopping_list"."week_start"
JOIN "meal" ON "meal"."plan_id" = "meal_plan"."id"
WHERE "meal"."recipe_id" IS NOT NULL
  AND "shopping_list"."week_start" <= date_trunc('week', now() AT TIME ZONE 'Europe/Sofia')::date
ON CONFLICT DO NOTHING;
