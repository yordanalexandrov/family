CREATE TABLE "pantry_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"ran_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_item_ingredient_id_unique" UNIQUE("ingredient_id"),
	CONSTRAINT "pantry_item_kind_check" CHECK ("pantry_item"."kind" in ('staple', 'use_up')),
	CONSTRAINT "pantry_item_ran_out_check" CHECK ("pantry_item"."ran_out_at" is null or "pantry_item"."kind" = 'staple')
);
--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;