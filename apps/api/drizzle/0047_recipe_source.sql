-- #358 (GLOSSARY: Източник на рецепта): a recipe keeps the pasted text of its import and the ids of its photos.
-- `IF NOT EXISTS`, so that a spec can run the migration again for its backfill.
ALTER TABLE "recipe" ADD COLUMN IF NOT EXISTS "source_text" text;--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN IF NOT EXISTS "source_photos" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- A recipe approved from a text import (with or without its link) gets that text; one from a link, a photo or by hand
-- stays without. Recipes that have a text already are left as they are.
UPDATE "recipe" SET "source_text" = "recipe_import_request"."text"
FROM "recipe_suggestion"
JOIN "recipe_import_request" ON "recipe_import_request"."id" = "recipe_suggestion"."import_request_id"
WHERE "recipe_suggestion"."recipe_id" = "recipe"."id"
	AND "recipe_import_request"."source" = 'text'
	AND "recipe_import_request"."text" IS NOT NULL
	AND "recipe"."source_text" IS NULL;
