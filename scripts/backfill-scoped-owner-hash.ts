import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { hashPhone } from "@nitsyclaw/shared/utils";

const scopedTables = [
  '"memories"',
  '"reminders"',
  '"expenses"',
  '"briefs"',
  '"confirmations"',
] as const;

type ScopedTable = (typeof scopedTables)[number];

loadLocalEnv([
  ".env.local",
  "apps/dashboard/.env.local",
  "apps/bot/.env.local",
  ".env",
  resolve(secretRoot(), ".env.local"),
]);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`tenant_owner_backfill=failed reason=${redactError(error)}`);
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log([
      "tenant_owner_backfill_usage=pnpm run tenant:owner-backfill -- [--apply]",
      "default=dry-run",
      "scope=memories,reminders,expenses,briefs,confirmations",
    ].join("\n"));
    return;
  }

  const ownerPhone = process.env.WHATSAPP_OWNER_NUMBER?.trim();
  if (!ownerPhone) throw new Error("WHATSAPP_OWNER_NUMBER is required");

  const databaseUrl = process.env.DATABASE_URL_DIRECT?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL_DIRECT or DATABASE_URL is required");

  const apply = process.argv.includes("--apply");
  const ownerHash = hashPhone(ownerPhone);
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 10 });

  try {
    const before = await countCandidates(sql);
    console.log(`tenant_owner_backfill_mode=${apply ? "apply" : "dry-run"}`);
    for (const table of scopedTables) {
      console.log(`${tableNameForLog(table)}_candidate_rows=${before[table]}`);
    }

    if (!apply) {
      console.log("tenant_owner_backfill_result=dry-run-only");
      return;
    }

    await sql.begin(async (tx) => {
      for (const table of scopedTables) {
        await tx.unsafe(
          `UPDATE ${table} SET "owner_hash" = $1 WHERE "owner_hash" IS NULL OR "owner_hash" = 'owner'`,
          [ownerHash],
        );
      }
    });

    const after = await countCandidates(sql);
    for (const table of scopedTables) {
      console.log(`${tableNameForLog(table)}_remaining_candidate_rows=${after[table]}`);
    }
    console.log("tenant_owner_backfill_result=applied");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function countCandidates(sql: postgres.Sql): Promise<Record<ScopedTable, number>> {
  const counts = {} as Record<ScopedTable, number>;
  for (const table of scopedTables) {
    const rows = await sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE "owner_hash" IS NULL OR "owner_hash" = 'owner'`,
    );
    counts[table] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

function tableNameForLog(table: ScopedTable): string {
  return table.replaceAll('"', "");
}

function loadLocalEnv(paths: string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key]) continue;
      process.env[key] = unquoteEnvValue(line.slice(eq + 1).trim());
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function secretRoot(): string {
  return process.env.NITSYCLAW_SECRET_ROOT || resolve(homedir(), ".nitsyclaw", "secrets");
}

function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted:database-url]")
    .replace(/\+\d{8,15}/g, "[redacted:phone]")
    .slice(0, 220);
}
