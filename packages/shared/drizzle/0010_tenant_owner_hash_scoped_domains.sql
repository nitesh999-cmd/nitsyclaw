ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "owner_hash" text;
--> statement-breakpoint
UPDATE "memories" SET "owner_hash" = 'owner' WHERE "owner_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "owner_hash" SET DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "memories" ALTER COLUMN "owner_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_owner_created_idx" ON "memories" USING btree ("owner_hash","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_owner_kind_idx" ON "memories" USING btree ("owner_hash","kind");
--> statement-breakpoint

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "owner_hash" text;
--> statement-breakpoint
UPDATE "reminders" SET "owner_hash" = 'owner' WHERE "owner_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "owner_hash" SET DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "owner_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_owner_status_fire_idx" ON "reminders" USING btree ("owner_hash","status","fire_at");
--> statement-breakpoint

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "owner_hash" text;
--> statement-breakpoint
UPDATE "expenses" SET "owner_hash" = 'owner' WHERE "owner_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "owner_hash" SET DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "owner_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_owner_occurred_idx" ON "expenses" USING btree ("owner_hash","occurred_at");
--> statement-breakpoint

ALTER TABLE "briefs" ADD COLUMN IF NOT EXISTS "owner_hash" text;
--> statement-breakpoint
UPDATE "briefs" SET "owner_hash" = 'owner' WHERE "owner_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "briefs" ALTER COLUMN "owner_hash" SET DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "briefs" ALTER COLUMN "owner_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "briefs" DROP CONSTRAINT IF EXISTS "briefs_for_date_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "briefs_owner_date_unique_idx" ON "briefs" USING btree ("owner_hash","for_date");
--> statement-breakpoint

ALTER TABLE "confirmations" ADD COLUMN IF NOT EXISTS "owner_hash" text;
--> statement-breakpoint
UPDATE "confirmations" SET "owner_hash" = 'owner' WHERE "owner_hash" IS NULL;
--> statement-breakpoint
ALTER TABLE "confirmations" ALTER COLUMN "owner_hash" SET DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE "confirmations" ALTER COLUMN "owner_hash" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "confirmations_owner_status_expires_idx" ON "confirmations" USING btree ("owner_hash","status","expires_at");
