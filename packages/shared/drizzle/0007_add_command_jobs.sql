CREATE TABLE IF NOT EXISTS "command_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL,
  "owner_hash" text NOT NULL DEFAULT 'owner',
  "command" text NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "risk_level" text NOT NULL DEFAULT 'safe',
  "receipt_text" text NOT NULL,
  "result_text" text,
  "error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "source_message_id" uuid,
  "source_external_id" text,
  "dedupe_key" text,
  "next_run_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "command_jobs_status_idx"
  ON "command_jobs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "command_jobs_owner_status_idx"
  ON "command_jobs" ("owner_hash", "status", "created_at");

CREATE INDEX IF NOT EXISTS "command_jobs_dedupe_idx"
  ON "command_jobs" ("dedupe_key");
