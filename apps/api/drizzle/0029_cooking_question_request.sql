CREATE TABLE "cooking_question_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"recipe_id" uuid NOT NULL,
	"question" text NOT NULL,
	"step" integer NOT NULL,
	"servings" integer NOT NULL,
	"answer" text,
	CONSTRAINT "cooking_question_request_status_check" CHECK ("cooking_question_request"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "cooking_question_request" ADD CONSTRAINT "cooking_question_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_question_request" ADD CONSTRAINT "cooking_question_request_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cooking_question_request_recipe_idx" ON "cooking_question_request" USING btree ("recipe_id");