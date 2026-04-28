// One-shot: apply migration 0001 (add surface column to messages).
// Usage: node packages/shared/scripts/apply-migration-0001.mjs
// Idempotent (uses IF NOT EXISTS).

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

// Prefer pooled DATABASE_URL — direct host (DATABASE_URL_DIRECT) is often
// DNS-unreachable from local laptop on Supabase free tier.
const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error("DATABASE_URL_DIRECT (or DATABASE_URL) not set");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../drizzle/0001_add_surface_to_messages.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = postgres(url, { max: 1, prepare: false });
try {
  console.log("[migrate] applying 0001_add_surface_to_messages...");
  await client.unsafe(sql);
  console.log("[migrate] OK");
  // Verify
  const cols = await client`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'surface'
  `;
  if (cols.length === 0) {
    console.error("[migrate] FAIL: surface column not found after migration");
    process.exit(1);
  }
  console.log("[migrate] verified:", cols[0]);
} finally {
  await client.end();
}
