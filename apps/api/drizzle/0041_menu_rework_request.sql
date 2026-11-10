CREATE TABLE "menu_rework_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"plan_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"changed" integer,
	CONSTRAINT "menu_rework_request_status_check" CHECK ("menu_rework_request"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "menu_rework_request" ADD CONSTRAINT "menu_rework_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_rework_request" ADD CONSTRAINT "menu_rework_request_plan_id_meal_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_rework_request_pending_plan_key" ON "menu_rework_request" USING btree ("plan_id") WHERE "menu_rework_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "menu_rework_request_week_created_idx" ON "menu_rework_request" USING btree ("week_start","created_at");