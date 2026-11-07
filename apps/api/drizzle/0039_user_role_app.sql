-- Role `app`: a service user (ADR-0014). Drizzle applies all pending migrations in one transaction, and a value added
-- with `ALTER TYPE … ADD VALUE` cannot be used before commit, so the seed in 0040 would fail. The type is rebuilt instead.
ALTER TYPE "public"."user_role" RENAME TO "user_role_old";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('parent', 'app');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::text::"public"."user_role";--> statement-breakpoint
DROP TYPE "public"."user_role_old";
