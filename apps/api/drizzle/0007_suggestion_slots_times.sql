ALTER TABLE "recipe_suggestion_request" ADD COLUMN "slots" text[];--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" ADD COLUMN "times" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Старите заявки: един слот става списък; горната граница става интервалите, които започват под нея.
UPDATE "recipe_suggestion_request" SET
  "slots" = array["slot"],
  "times" = coalesce(
    array(
      select "range" from (values ('0-15', 0), ('15-30', 15), ('30-45', 30), ('45-60', 45), ('60+', 60)) as r("range", "above")
      where "max_minutes" > "above"
      order by "above"
    ),
    '{}'
  );--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" ALTER COLUMN "slots" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" ADD CONSTRAINT "recipe_suggestion_request_slots_check" CHECK (cardinality("recipe_suggestion_request"."slots") > 0 and "recipe_suggestion_request"."slots" <@ array['breakfast', 'lunch', 'dinner']::text[]);--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" ADD CONSTRAINT "recipe_suggestion_request_times_check" CHECK ("recipe_suggestion_request"."times" <@ array['0-15', '15-30', '30-45', '45-60', '60+']::text[]);
