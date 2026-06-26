CREATE TABLE IF NOT EXISTS "daily_focus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_hash" text DEFAULT 'owner' NOT NULL,
	"for_date" text NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chosen_text" text,
	"chosen_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_focus_owner_date_unique_idx" ON "daily_focus" USING btree ("owner_hash","for_date");
