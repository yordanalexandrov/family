CREATE TABLE "recipe_refine_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"recipe_id" uuid NOT NULL,
	"refinement" jsonb,
	"no_results" text,
	CONSTRAINT "recipe_refine_request_status_check" CHECK ("recipe_refine_request"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "recipe_refine_request" ADD CONSTRAINT "recipe_refine_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_refine_request" ADD CONSTRAINT "recipe_refine_request_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_refine_request_pending_recipe_key" ON "recipe_refine_request" USING btree ("recipe_id") WHERE "recipe_refine_request"."status" = 'pending';