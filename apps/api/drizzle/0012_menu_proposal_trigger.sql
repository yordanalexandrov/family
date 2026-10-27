ALTER TABLE "meal_plan" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ALTER COLUMN "requested_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ADD COLUMN "trigger" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ADD CONSTRAINT "menu_proposal_request_trigger_check" CHECK ("menu_proposal_request"."trigger" in ('user', 'schedule'));--> statement-breakpoint
ALTER TABLE "menu_proposal_request" ADD CONSTRAINT "menu_proposal_request_requested_by_check" CHECK ("menu_proposal_request"."trigger" <> 'user' or "menu_proposal_request"."requested_by" is not null);