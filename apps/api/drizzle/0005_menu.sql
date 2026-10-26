CREATE TABLE "meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" text NOT NULL,
	"recipe_id" uuid,
	"note" text,
	"cook_user_id" uuid,
	"servings" jsonb NOT NULL,
	"why" text,
	CONSTRAINT "meal_slot_check" CHECK ("meal"."slot" in ('breakfast', 'lunch', 'dinner'))
);
--> statement-breakpoint
CREATE TABLE "meal_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"summary" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "menu_proposal_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "menu_proposal_request_status_check" CHECK ("menu_proposal_request"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_cook_user_id_user_id_fk" FOREIGN KEY ("cook_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ADD CONSTRAINT "menu_proposal_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ADD CONSTRAINT "menu_proposal_request_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plan_date_slot_key" ON "meal" USING btree ("plan_id","date","slot");--> statement-breakpoint
CREATE INDEX "meal_date_idx" ON "meal" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_proposal_request_pending_week_key" ON "menu_proposal_request" USING btree ("week_start") WHERE "menu_proposal_request"."status" = 'pending';