-- Migration 0001: add `surface` column to messages table.
-- Same-page WhatsApp + dashboard chat continuity (NWP session 5).
-- Existing rows backfill to 'whatsapp' via DEFAULT, so this is non-destructive.

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "surface" text NOT NULL DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS "messages_surface_created_idx"
  ON "messages" ("surface", "created_at");
