-- #237: a step of a recipe or of a stored suggestion becomes an object `{ "text": … }` with a place for a photo
-- (`photoId`), instead of a string. Text and order are kept; steps that are objects already are left as they are.
UPDATE "recipe" SET "steps" = (
	SELECT jsonb_agg(
		CASE WHEN jsonb_typeof(s.step) = 'string' THEN jsonb_build_object('text', s.step #>> '{}') ELSE s.step END
		ORDER BY s.position
	)
	FROM jsonb_array_elements("recipe"."steps") WITH ORDINALITY AS s(step, position)
)
WHERE EXISTS (
	SELECT 1 FROM jsonb_array_elements("recipe"."steps") AS s(step) WHERE jsonb_typeof(s.step) = 'string'
);
--> statement-breakpoint
UPDATE "recipe_suggestion" SET "payload" = jsonb_set("payload", '{steps}', (
	SELECT jsonb_agg(
		CASE WHEN jsonb_typeof(s.step) = 'string' THEN jsonb_build_object('text', s.step #>> '{}') ELSE s.step END
		ORDER BY s.position
	)
	FROM jsonb_array_elements("recipe_suggestion"."payload" -> 'steps') WITH ORDINALITY AS s(step, position)
))
WHERE EXISTS (
	SELECT 1 FROM jsonb_array_elements("recipe_suggestion"."payload" -> 'steps') AS s(step) WHERE jsonb_typeof(s.step) = 'string'
);
