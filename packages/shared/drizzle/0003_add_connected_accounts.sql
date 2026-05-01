CREATE TABLE IF NOT EXISTS "connected_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "owner_hash" text NOT NULL,
  "account_label" text DEFAULT 'default' NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "scope" text DEFAULT '' NOT NULL,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connected_accounts_provider_owner_idx"
  ON "connected_accounts" ("provider", "owner_hash", "account_label");

CREATE UNIQUE INDEX IF NOT EXISTS "connected_accounts_provider_owner_unique_idx"
  ON "connected_accounts" ("provider", "owner_hash", "account_label");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'connected_accounts_provider_check'
  ) THEN
    ALTER TABLE "connected_accounts"
      ADD CONSTRAINT "connected_accounts_provider_check"
      CHECK ("provider" IN ('spotify'));
  END IF;
END $$;
