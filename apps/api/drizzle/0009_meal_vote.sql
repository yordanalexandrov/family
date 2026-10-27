CREATE TABLE "meal_vote" (
	"meal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_vote_meal_id_user_id_pk" PRIMARY KEY("meal_id","user_id"),
	CONSTRAINT "meal_vote_value_check" CHECK ("meal_vote"."value" in ('up', 'down'))
);
--> statement-breakpoint
ALTER TABLE "meal_vote" ADD CONSTRAINT "meal_vote_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_vote" ADD CONSTRAINT "meal_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;