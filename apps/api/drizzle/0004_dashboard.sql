CREATE TABLE "budget_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_budget_id" text NOT NULL,
	"name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"limit_amount" numeric(12, 2) NOT NULL,
	"spent" numeric(12, 2) NOT NULL,
	"remaining" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"ical_uid" text,
	"original_start" timestamp with time zone,
	"title" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"all_day" boolean NOT NULL,
	"location" text,
	"html_link" text,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_event_source_external_id_unique" UNIQUE("calendar_source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" uuid,
	"color_token" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_source_google_calendar_id_unique" UNIQUE("google_calendar_id"),
	CONSTRAINT "calendar_source_kind_check" CHECK ("calendar_source"."kind" in ('person', 'family'))
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"error" text,
	CONSTRAINT "sync_run_source_check" CHECK ("sync_run"."source" in ('calendar', 'budget')),
	CONSTRAINT "sync_run_status_check" CHECK ("sync_run"."status" in ('running', 'ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_calendar_source_id_calendar_source_id_fk" FOREIGN KEY ("calendar_source_id") REFERENCES "public"."calendar_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_source" ADD CONSTRAINT "calendar_source_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_snapshot_synced_at_idx" ON "budget_snapshot" USING btree ("synced_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calendar_event_start_idx" ON "calendar_event" USING btree ("start");--> statement-breakpoint
CREATE INDEX "calendar_event_ical_uid_idx" ON "calendar_event" USING btree ("ical_uid");--> statement-breakpoint
CREATE INDEX "sync_run_source_started_at_idx" ON "sync_run" USING btree ("source","started_at" DESC NULLS LAST);