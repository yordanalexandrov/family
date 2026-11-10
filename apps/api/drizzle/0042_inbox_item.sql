CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "inbox_item_kind_check" CHECK ("inbox_item"."kind" in ('thaw', 'cook', 'menu'))
);
--> statement-breakpoint
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_item_user_id_tag_idx" ON "inbox_item" USING btree ("user_id","tag");--> statement-breakpoint
CREATE INDEX "inbox_item_user_id_updated_at_idx" ON "inbox_item" USING btree ("user_id","updated_at");