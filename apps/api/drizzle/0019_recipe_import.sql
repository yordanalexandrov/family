CREATE TABLE "recipe_import_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source" text NOT NULL,
	"url" text,
	"text" text,
	"no_results" text,
	CONSTRAINT "recipe_import_request_status_check" CHECK ("recipe_import_request"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "recipe_import_request_source_check" CHECK ("recipe_import_request"."source" in ('text', 'url', 'photo'))
);
--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ALTER COLUMN "request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD COLUMN "import_request_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_import_request" ADD CONSTRAINT "recipe_import_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD CONSTRAINT "recipe_suggestion_import_request_id_recipe_import_request_id_fk" FOREIGN KEY ("import_request_id") REFERENCES "public"."recipe_import_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_suggestion_import_request_key" ON "recipe_suggestion" USING btree ("import_request_id");--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD CONSTRAINT "recipe_suggestion_request_check" CHECK (num_nonnulls("recipe_suggestion"."request_id", "recipe_suggestion"."import_request_id") = 1);