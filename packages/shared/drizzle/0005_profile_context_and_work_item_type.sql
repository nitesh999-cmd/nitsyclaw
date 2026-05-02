-- Migration 0005: structured profile context and typed work items.
-- Keeps active assistant context out of generic memory and lets the queue
-- distinguish features from bugs without parsing description text.

ALTER TABLE "feature_requests"
  ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'feature',
  ADD COLUMN IF NOT EXISTS "severity" text,
  ADD COLUMN IF NOT EXISTS "dedupe_key" text;

CREATE TABLE IF NOT EXISTS "profile_context" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_hash" text NOT NULL DEFAULT 'owner',
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "sensitivity" text NOT NULL DEFAULT 'personal',
  "expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "profile_context_owner_key_unique_idx"
  ON "profile_context" ("owner_hash", "key");

CREATE INDEX IF NOT EXISTS "profile_context_key_idx"
  ON "profile_context" ("key");
