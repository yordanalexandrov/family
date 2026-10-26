CREATE TABLE "shopping_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"quantity" numeric,
	"unit" text,
	"aisle" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_item_kind_check" CHECK ("shopping_item"."kind" in ('computed', 'manual')),
	CONSTRAINT "shopping_item_unit_check" CHECK ("shopping_item"."unit" in ('g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp', 'pinch')),
	CONSTRAINT "shopping_item_aisle_check" CHECK ("shopping_item"."aisle" in ('produce', 'bakery', 'meat', 'fish', 'dairy', 'grains', 'canned', 'spices', 'frozen', 'drinks', 'other'))
);
--> statement-breakpoint
CREATE TABLE "shopping_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_list_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_list_id_shopping_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_item_list_key" ON "shopping_item" USING btree ("list_id","item_key");