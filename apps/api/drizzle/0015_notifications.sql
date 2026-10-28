CREATE TABLE "notification_log" (
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"on_date" date NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_kind_subject_id_on_date_user_id_pk" PRIMARY KEY("kind","subject_id","on_date","user_id"),
	CONSTRAINT "notification_log_kind_check" CHECK ("notification_log"."kind" in ('thaw', 'cook', 'menu'))
);
--> statement-breakpoint
CREATE TABLE "notification_setting" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_setting_user_id_kind_pk" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "notification_setting_kind_check" CHECK ("notification_setting"."kind" in ('thaw', 'cook', 'menu'))
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "push_subscription" USING btree ("user_id");