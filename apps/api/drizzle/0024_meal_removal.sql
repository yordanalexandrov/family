CREATE TABLE "meal_removal" (
	"meal_id" uuid PRIMARY KEY NOT NULL,
	"removed_by" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"why" text,
	"votes" jsonb NOT NULL,
	"comment_id" uuid,
	"removed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_removal" ADD CONSTRAINT "meal_removal_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_removal" ADD CONSTRAINT "meal_removal_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_removal" ADD CONSTRAINT "meal_removal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_removal" ADD CONSTRAINT "meal_removal_comment_id_meal_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."meal_comment"("id") ON DELETE set null ON UPDATE no action;