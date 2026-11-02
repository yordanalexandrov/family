CREATE TABLE "recipe_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"servings" integer NOT NULL,
	CONSTRAINT "recipe_component_name_check" CHECK (char_length("recipe_component"."name") between 1 and 40),
	CONSTRAINT "recipe_component_servings_check" CHECK ("recipe_component"."servings" >= 1)
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD COLUMN "component_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_component" ADD CONSTRAINT "recipe_component_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_component_position_key" ON "recipe_component" USING btree ("recipe_id","position");--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_component_id_recipe_component_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."recipe_component"("id") ON DELETE cascade ON UPDATE no action;