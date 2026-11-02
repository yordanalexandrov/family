CREATE TABLE "recipe_revision_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"recipe_id" uuid NOT NULL,
	"instruction" text NOT NULL,
	"base_updated_at" timestamp with time zone NOT NULL,
	"revision" jsonb,
	"no_results" text,
	"decision" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "recipe_revision_request_status_check" CHECK ("recipe_revision_request"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "recipe_revision_request_decision_check" CHECK ("recipe_revision_request"."decision" in ('accepted', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD CONSTRAINT "recipe_revision_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD CONSTRAINT "recipe_revision_request_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD CONSTRAINT "recipe_revision_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_revision_request_recipe_idx" ON "recipe_revision_request" USING btree ("recipe_id");