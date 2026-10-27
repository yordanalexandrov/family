CREATE TABLE "meal_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "meal_comment_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	CONSTRAINT "meal_comment_kind_check" CHECK ("meal_comment"."kind" in ('comment', 'system'))
);
--> statement-breakpoint
ALTER TABLE "meal_comment" ADD CONSTRAINT "meal_comment_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_comment" ADD CONSTRAINT "meal_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_comment_meal_created_idx" ON "meal_comment" USING btree ("meal_id","created_at");