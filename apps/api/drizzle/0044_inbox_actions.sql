ALTER TABLE "meal" ADD COLUMN "thawed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD COLUMN "actions" jsonb;--> statement-breakpoint
ALTER TABLE "inbox_item" ADD COLUMN "action_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_thawed_by_user_id_user_id_fk" FOREIGN KEY ("thawed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;