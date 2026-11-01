ALTER TABLE "recipe_revision_request" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ALTER COLUMN "base_updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD COLUMN "suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD COLUMN "base_recipe" jsonb;--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD CONSTRAINT "recipe_revision_request_suggestion_id_recipe_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."recipe_suggestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_revision_request_suggestion_idx" ON "recipe_revision_request" USING btree ("suggestion_id");--> statement-breakpoint
ALTER TABLE "recipe_revision_request" ADD CONSTRAINT "recipe_revision_request_target_check" CHECK (num_nonnulls("recipe_revision_request"."recipe_id", "recipe_revision_request"."suggestion_id") = 1);