CREATE TABLE "appliance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "appliance" text;--> statement-breakpoint
CREATE UNIQUE INDEX "appliance_name_unique" ON "appliance" USING btree (lower("name"));