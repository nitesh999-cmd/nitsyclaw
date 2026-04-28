// One-shot: apply migration 0002 (feature_requests table).
// Usage: node packages/shared/scripts/apply-migration-0002.mjs
// Idempotent (uses IF NOT EXISTS).

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

// Pooled DATABASE_URL is the local-dev safe choice (DATABASE_URL_DIRECT
// often DNS-unreachable on Supabase free tier — see mind.md L23).
const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "../drizzle/0002_add_feature_requests.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = postgres(url, { max: 1, prepare: false });
try {
  console.log("[migrate] applying 0002_add_feature_requests...");
  await client.unsafe(sql);
  console.log("[migrate] OK");
  const cols = await client`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'feature_requests'
    ORDER BY ordinal_position
  `;
  console.log("[migrate] verified columns:", cols.length);
  for (const c of cols) console.log("  -", c.column_name, c.data_type);
} finally {
  await client.end();
}
