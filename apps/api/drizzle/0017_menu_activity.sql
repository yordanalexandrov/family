CREATE TABLE "menu_activity" (
	"week_start" date NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"swaps" integer DEFAULT 0 NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	CONSTRAINT "menu_activity_week_start_recipient_user_id_pk" PRIMARY KEY("week_start","recipient_user_id")
);
--> statement-breakpoint
ALTER TABLE "menu_activity" ADD CONSTRAINT "menu_activity_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;