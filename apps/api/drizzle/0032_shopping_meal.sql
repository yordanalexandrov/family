CREATE TABLE "shopping_meal" (
	"list_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_meal_list_id_meal_id_pk" PRIMARY KEY("list_id","meal_id")
);
--> statement-breakpoint
ALTER TABLE "shopping_meal" ADD CONSTRAINT "shopping_meal_list_id_shopping_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_meal" ADD CONSTRAINT "shopping_meal_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;