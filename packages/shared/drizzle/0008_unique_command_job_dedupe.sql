DROP INDEX IF EXISTS "command_jobs_dedupe_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "command_jobs_dedupe_idx"
  ON "command_jobs" ("dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;
