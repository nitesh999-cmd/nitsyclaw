-- NitsyClaw tenant owner_hash migration draft.
--
-- STATUS: REVIEW ONLY. Do not apply to production without:
-- 1. a fresh database backup,
-- 2. explicit approval for this exact file,
-- 3. passing tenant isolation, typecheck, build, and WhatsApp smoke gates.
--
-- Purpose:
-- Add an owner boundary to current single-owner customer-data tables so the app
-- can later become safely multi-customer. This draft does not remove existing
-- data and does not drop the existing briefs date-only uniqueness.

BEGIN;

ALTER TABLE "memories"
  ADD COLUMN IF NOT EXISTS "owner_hash" text;

UPDATE "memories"
SET "owner_hash" = 'owner'
WHERE "owner_hash" IS NULL;

ALTER TABLE "memories"
  ALTER COLUMN "owner_hash" SET DEFAULT 'owner',
  ALTER COLUMN "owner_hash" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "memories_owner_created_idx"
  ON "memories" ("owner_hash", "created_at");

CREATE INDEX IF NOT EXISTS "memories_owner_kind_idx"
  ON "memories" ("owner_hash", "kind");

ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "owner_hash" text;

UPDATE "reminders"
SET "owner_hash" = 'owner'
WHERE "owner_hash" IS NULL;

ALTER TABLE "reminders"
  ALTER COLUMN "owner_hash" SET DEFAULT 'owner',
  ALTER COLUMN "owner_hash" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "reminders_owner_status_fire_idx"
  ON "reminders" ("owner_hash", "status", "fire_at");

ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "owner_hash" text;

UPDATE "expenses"
SET "owner_hash" = 'owner'
WHERE "owner_hash" IS NULL;

ALTER TABLE "expenses"
  ALTER COLUMN "owner_hash" SET DEFAULT 'owner',
  ALTER COLUMN "owner_hash" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "expenses_owner_occurred_idx"
  ON "expenses" ("owner_hash", "occurred_at");

ALTER TABLE "briefs"
  ADD COLUMN IF NOT EXISTS "owner_hash" text;

UPDATE "briefs"
SET "owner_hash" = 'owner'
WHERE "owner_hash" IS NULL;

ALTER TABLE "briefs"
  ALTER COLUMN "owner_hash" SET DEFAULT 'owner',
  ALTER COLUMN "owner_hash" SET NOT NULL;

-- Keep the existing date-only unique constraint/index in place for this first
-- migration. Removing it should be a separate approved cutover after code is
-- deployed and verified with owner-scoped daily brief writes.
CREATE UNIQUE INDEX IF NOT EXISTS "briefs_owner_date_unique_idx"
  ON "briefs" ("owner_hash", "for_date");

ALTER TABLE "confirmations"
  ADD COLUMN IF NOT EXISTS "owner_hash" text;

UPDATE "confirmations"
SET "owner_hash" = 'owner'
WHERE "owner_hash" IS NULL;

ALTER TABLE "confirmations"
  ALTER COLUMN "owner_hash" SET DEFAULT 'owner',
  ALTER COLUMN "owner_hash" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "confirmations_owner_status_expires_idx"
  ON "confirmations" ("owner_hash", "status", "expires_at");

COMMIT;

-- Post-apply verification query, read-only:
--
-- SELECT 'memories' AS table_name, COUNT(*) FROM "memories" WHERE "owner_hash" IS NULL
-- UNION ALL SELECT 'reminders', COUNT(*) FROM "reminders" WHERE "owner_hash" IS NULL
-- UNION ALL SELECT 'expenses', COUNT(*) FROM "expenses" WHERE "owner_hash" IS NULL
-- UNION ALL SELECT 'briefs', COUNT(*) FROM "briefs" WHERE "owner_hash" IS NULL
-- UNION ALL SELECT 'confirmations', COUNT(*) FROM "confirmations" WHERE "owner_hash" IS NULL;
