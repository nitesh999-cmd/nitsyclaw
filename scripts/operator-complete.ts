import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  getDb,
  logAudit,
  setFeatureRequestStatus,
} from "@nitsyclaw/shared/db";
import { appendAgentRunLog } from "./agent-run-log";

const args = parseArgs(process.argv.slice(2));
loadLocalEnv([".env.local", "apps/dashboard/.env.local", ".env"]);

async function main() {
  const id = requiredArg("id");
  const commit = args.get("commit");
  const deployment = args.get("deployment");
  const note = args.get("note");
  const status = args.get("status") ?? "done";
  if (status !== "done" && status !== "rejected") {
    throw new Error("status must be done or rejected");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("id must be a feature request UUID");
  }

  const implementationNotes = [
    note,
    commit ? `Commit: ${commit}` : undefined,
    deployment ? `Deployment: ${deployment}` : undefined,
  ].filter((line): line is string => Boolean(line?.trim())).join("\n");

  const db = getDb();
  const updated = await setFeatureRequestStatus(db, id, {
    status,
    expectedStatus: "in_progress",
    implementationNotes: implementationNotes || undefined,
    prUrl: commit ? `https://github.com/nitesh999-cmd/nitsyclaw/commit/${commit}` : undefined,
    rejectionReason: status === "rejected" ? (note ?? "Rejected by operator completion command.") : undefined,
    completedAt: new Date(),
  });

  if (!updated) {
    throw new Error(`operator item ${id} was not updated; expected status in_progress`);
  }

  await logAudit(db, {
    actor: "operator-runner",
    tool: "operator_runner.complete",
    input: { jobId: id },
    output: {
      status,
      ...(commit ? { commit } : {}),
      ...(deployment ? { deployment } : {}),
    },
    success: true,
  });
  await appendAgentRunLog({
    operation: "operator_runner.complete",
    jobId: id,
    inputSummary: note ?? `Mark operator item ${id} as ${status}.`,
    decisions: [`status=${status}`],
    verification: commit ? [`commit=${commit}`] : [],
    result: `Operator item marked ${status}.`,
    commit,
    deployment,
  });

  console.log(`operator_item_${status}=${id}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(formatOperatorCompleteError(error));
    process.exitCode = 1;
  });
}

export function formatOperatorCompleteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `operator-complete failed: ${redact(message).slice(0, 220)}`;
}

function requiredArg(name: string): string {
  const value = args.get(name);
  if (!value?.trim()) throw new Error(`missing --${name}`);
  return value.trim();
}

function parseArgs(values: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    if (!current?.startsWith("--")) continue;
    const key = current.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, "true");
      continue;
    }
    parsed.set(key, next);
    index += 1;
  }
  return parsed;
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

function redact(value: string): string {
  return value
    .replace(/\bpostgres(?:ql)?:\/\/\S+/gi, "[redacted:database-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted:email]")
    .replace(/\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g, "[redacted:token]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[redacted:phone]");
}
