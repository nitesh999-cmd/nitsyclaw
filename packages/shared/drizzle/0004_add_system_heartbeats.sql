CREATE TABLE IF NOT EXISTS "system_heartbeats" (
  "source" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
