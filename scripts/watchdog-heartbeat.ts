import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  getDb,
  getSystemHeartbeat,
  upsertSystemHeartbeat,
} from "@nitsyclaw/shared/db";

const args = parseArgs(process.argv.slice(2));
const source = args.source ?? "local-watchdog";
const status = args.status ?? "ok";
const event = args.event ?? "tick";
const dryRun = args.dryRun === true;

loadLocalEnv([".env.local", "apps/dashboard/.env.local", ".env"]);

async function main() {
  const metadata = {
    event,
    pid: process.pid,
    runtime: "local-windows-watchdog",
    at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(
      `watchdog heartbeat dry-run source=${source} status=${status} event=${event}`,
    );
    return;
  }

  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_DIRECT) {
    throw new Error("DATABASE_URL or DATABASE_URL_DIRECT is required to publish watchdog heartbeat");
  }

  const db = getDb(process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT);
  if (status === "ok" && event === "tick") {
    const current = await getSystemHeartbeat(db, source);
    const restartingAgeMs = current?.status === "restarting"
      ? Date.now() - current.lastSeenAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (restartingAgeMs >= 0 && restartingAgeMs < 2 * 60 * 1000) {
      console.log(
        `watchdog heartbeat skipped stale ok tick; recent restarting signal is ${Math.round(restartingAgeMs / 1000)}s old`,
      );
      return;
    }
  }

  await upsertSystemHeartbeat(db, {
    source,
    status,
    metadata,
  });
  console.log(`watchdog heartbeat source=${source} status=${status} event=${event}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(formatWatchdogHeartbeatError(error));
    process.exitCode = 1;
  });
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;
const TOKEN_RE = /\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g;
const POSTGRES_URL_RE = /\bpostgres(?:ql)?:\/\/\S+/gi;

export function formatWatchdogHeartbeatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = message
    .replace(POSTGRES_URL_RE, "[redacted:database-url]")
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(TOKEN_RE, "[redacted:token]")
    .replace(PHONE_RE, "[redacted:phone]");
  return `watchdog heartbeat failed: ${redacted.slice(0, 200)}`;
}

function parseArgs(argv: string[]): {
  source?: string;
  status?: string;
  event?: string;
  dryRun?: boolean;
} {
  const parsed: {
    source?: string;
    status?: string;
    event?: string;
    dryRun?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--source") {
      parsed.source = cleanArgValue(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--status") {
      parsed.status = cleanArgValue(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--event") {
      parsed.event = cleanArgValue(argv[i + 1]);
      i += 1;
    }
  }

  return parsed;
}

function cleanArgValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[^\w.-]/g, "").slice(0, 80) || undefined;
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
