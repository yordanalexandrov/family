-- #359 (ADR-0016): the photos of the source of a recipe import, and the ids an import keeps of them.
CREATE TABLE "source_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_import_request" ADD COLUMN "photos" uuid[] DEFAULT '{}' NOT NULL;