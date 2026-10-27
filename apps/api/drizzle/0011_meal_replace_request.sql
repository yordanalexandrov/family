CREATE TABLE "meal_replace_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"meal_id" uuid NOT NULL,
	"candidates" jsonb,
	CONSTRAINT "meal_replace_request_status_check" CHECK ("meal_replace_request"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "meal_replace_request" ADD CONSTRAINT "meal_replace_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_replace_request" ADD CONSTRAINT "meal_replace_request_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_replace_request_pending_meal_key" ON "meal_replace_request" USING btree ("meal_id") WHERE "meal_replace_request"."status" = 'pending';