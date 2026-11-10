-- The gathered counts cannot become single actions; at most 10 minutes of them are not told (#342).
DELETE FROM "menu_activity";--> statement-breakpoint
ALTER TABLE "menu_activity" DROP CONSTRAINT "menu_activity_week_start_recipient_user_id_pk";--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "seq" bigint PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "menu_activity_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "actor_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "meal_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD COLUMN "at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_activity" ADD CONSTRAINT "menu_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_activity_recipient_week_idx" ON "menu_activity" USING btree ("recipient_user_id","week_start");--> statement-breakpoint
ALTER TABLE "menu_activity" DROP COLUMN "votes";--> statement-breakpoint
ALTER TABLE "menu_activity" DROP COLUMN "comments";--> statement-breakpoint
ALTER TABLE "menu_activity" DROP COLUMN "swaps";--> statement-breakpoint
ALTER TABLE "menu_activity" DROP COLUMN "last_at";--> statement-breakpoint
ALTER TABLE "menu_activity" ADD CONSTRAINT "menu_activity_kind_check" CHECK ("menu_activity"."kind" in ('votes', 'comments', 'swaps'));