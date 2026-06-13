import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, resetEnvCache } from "@nitsyclaw/shared";
import { loadBotDotenv, secretRoot, whatsappSessionDir } from "../apps/bot/src/secret-paths";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadLocalEnv([
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
  resolve(repoRoot, "apps", "dashboard", ".env.local"),
]);
loadBotDotenv();
resetEnvCache();

const REQUIRED_TABLES = [
  "messages",
  "feature_requests",
  "system_heartbeats",
  "audit_log",
  "command_jobs",
] as const;

async function main(): Promise<void> {
  const env = loadEnv();
  console.log("bot doctor env=ok");
  console.log(`bot doctor timezone=${env.TIMEZONE}`);

  const root = secretRoot();
  const sessionDir = whatsappSessionDir(env.WHATSAPP_SESSION_DIR);
  console.log(`bot doctor secretRoot=${maskPath(root)}`);
  console.log(`bot doctor whatsappSessionDir=${maskPath(sessionDir)}`);

  const dbUrl = env.DATABASE_URL ?? env.DATABASE_URL_DIRECT;
  const sql = postgres(dbUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const rows = await sql<{ table_name: string; exists: boolean }[]>`
      SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
      FROM unnest(${REQUIRED_TABLES}::text[]) AS table_name
    `;

    const missing = rows.filter((row) => !row.exists).map((row) => row.table_name);
    if (missing.length > 0) {
      throw new Error(`Missing required database table(s): ${missing.join(", ")}`);
    }

    const [{ ok }] = await sql<{ ok: number }[]>`SELECT 1 AS ok`;
    if (ok !== 1) throw new Error("Database health query returned an unexpected result");

    console.log(`bot doctor db=ok tables=${REQUIRED_TABLES.length}`);
    console.log("bot doctor result=pass");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function loadLocalEnv(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = unquoteEnvValue(rawValue);
    }
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function maskPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `.../${parts.slice(-2).join("/")}`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`bot doctor result=fail reason=${redact(message)}`);
  process.exitCode = 1;
});

function redact(value: string): string {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/\S+/gi, "[redacted:database-url]")
    .replace(/\bdb\.[a-z0-9-]+\.supabase\.co\b/gi, "[redacted:database-host]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted:email]")
    .replace(/\b(?:(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g, "[redacted:token]")
    .slice(0, 300);
}
