CREATE TABLE "ingredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"aisle" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_unit_check" CHECK ("ingredient"."unit" in ('g', 'ml', 'pcs')),
	CONSTRAINT "ingredient_aisle_check" CHECK ("ingredient"."aisle" in ('produce', 'bakery', 'meat', 'fish', 'dairy', 'grains', 'canned', 'spices', 'frozen', 'drinks', 'other'))
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"servings" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"source_url" text,
	"prep_minutes" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"nutrition_per_100g" jsonb,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_servings_check" CHECK ("recipe"."servings" >= 1),
	CONSTRAINT "recipe_tags_check" CHECK ("recipe"."tags" <@ array['breakfast', 'lunch', 'dinner', 'quick', 'batch', 'kid_friendly']::text[])
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"quantity" numeric,
	"unit" text NOT NULL,
	"note" text,
	CONSTRAINT "recipe_ingredient_unit_check" CHECK ("recipe_ingredient"."unit" in ('g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'pinch')),
	CONSTRAINT "recipe_ingredient_pinch_check" CHECK ("recipe_ingredient"."unit" <> 'pinch' or "recipe_ingredient"."quantity" is null)
);
--> statement-breakpoint
CREATE TABLE "recipe_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"recipe_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "recipe_suggestion_status_check" CHECK ("recipe_suggestion"."status" in ('proposed', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "recipe_suggestion_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot" text NOT NULL,
	"max_minutes" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "recipe_suggestion_request_slot_check" CHECK ("recipe_suggestion_request"."slot" in ('breakfast', 'lunch', 'dinner')),
	CONSTRAINT "recipe_suggestion_request_status_check" CHECK ("recipe_suggestion_request"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "recipe_suggestion_request_tags_check" CHECK ("recipe_suggestion_request"."tags" <@ array['breakfast', 'lunch', 'dinner', 'quick', 'batch', 'kid_friendly']::text[])
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD CONSTRAINT "recipe_suggestion_request_id_recipe_suggestion_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."recipe_suggestion_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD CONSTRAINT "recipe_suggestion_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestion" ADD CONSTRAINT "recipe_suggestion_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_suggestion_request" ADD CONSTRAINT "recipe_suggestion_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredient_name_key" ON "ingredient" USING btree (lower(trim("name")));--> statement-breakpoint
CREATE INDEX "recipe_archived_at_idx" ON "recipe" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredient_position_key" ON "recipe_ingredient" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_suggestion_position_key" ON "recipe_suggestion" USING btree ("request_id","position");