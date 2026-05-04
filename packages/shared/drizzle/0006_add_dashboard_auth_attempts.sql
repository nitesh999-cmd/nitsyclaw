CREATE TABLE IF NOT EXISTS "dashboard_auth_attempts" (
  "client_key" text PRIMARY KEY,
  "failures" integer NOT NULL DEFAULT 0,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT NOW()
);
