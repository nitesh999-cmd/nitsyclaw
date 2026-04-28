-- Migration 0002: feature_requests table.
-- Captures `request_feature` tool calls from WhatsApp + dashboard.
-- Processed by daily CCR routine (NWP build agent) that runs NWP and implements.
-- Idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "feature_requests" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "description"           text NOT NULL,
  "size"                  text NOT NULL DEFAULT 'M',
  "status"                text NOT NULL DEFAULT 'pending',
  "source"                text NOT NULL,
  "requested_by"          text,
  "implementation_notes"  text,
  "pr_url"                text,
  "rejection_reason"      text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT NOW(),
  "completed_at"          timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "feature_requests_status_idx"
  ON "feature_requests" ("status", "created_at");
