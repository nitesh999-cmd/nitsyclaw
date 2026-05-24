import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  getDb,
  listPendingFeatureRequests,
  logAudit,
  setFeatureRequestStatus,
} from "@nitsyclaw/shared/db";
import {
  buildOperatorRunPlan,
  formatOperatorRunReport,
  selectNextOperatorJob,
  type OperatorQueueJob,
} from "../packages/shared/src/ops/operator-runner";

const args = new Set(process.argv.slice(2));
const shouldRun = args.has("--run");
const shouldClaim = args.has("--claim") || shouldRun;
const shouldRejectUnsafe = args.has("--reject-unsafe");
const dryRun = args.has("--dry-run") || (!shouldClaim && !shouldRejectUnsafe);
const commandTimeoutMs = Number(process.env.OPERATOR_COMMAND_TIMEOUT_MS ?? 10 * 60 * 1000);

const ALLOWED_VERIFICATION_COMMANDS = new Set([
  "pnpm lint",
  "pnpm -r typecheck",
  "pnpm typecheck",
  "pnpm build",
  "pnpm test",
  "pnpm test:coverage",
  "pnpm test:e2e",
  "pnpm run whatsapp:release-gate",
]);

loadLocalEnv([".env.local", "apps/dashboard/.env.local", ".env"]);

async function main() {
  const db = getDb();
  const pendingRows = await listPendingFeatureRequests(db);
  const job = selectNextOperatorJob(
    pendingRows.map((row): OperatorQueueJob => ({
      id: row.id,
      description: row.description,
      status: row.status,
      type: row.type,
      severity: row.severity,
      size: row.size,
      createdAt: row.createdAt,
    })),
  );

  if (!job) {
    console.log("No pending operator jobs.");
    return;
  }

  const plan = buildOperatorRunPlan(job);
  console.log(formatOperatorRunReport(plan));

  if (dryRun) {
    console.log("mode=dry-run");
    return;
  }

  if (plan.decision === "reject") {
    if (!shouldRejectUnsafe) {
      console.log("mode=no-mutation; add --reject-unsafe to reject this unsafe item");
      return;
    }
    const updated = await setFeatureRequestStatus(db, job.id, {
      status: "rejected",
      expectedStatus: "pending",
      rejectionReason: plan.rejectionReason,
      completedAt: new Date(),
    });
    if (!updated) {
      throw new Error(`operator job ${job.id} was not updated; it may have been claimed or removed`);
    }
    await logAudit(db, {
      actor: "operator-runner",
      tool: "operator_runner.reject",
      input: { jobId: job.id },
      output: { decision: plan.decision, nextStatus: plan.nextStatus },
      success: true,
    });
    console.log("mode=mutated status=rejected");
    return;
  }

  if (!shouldClaim) {
    console.log("mode=no-mutation; add --claim to claim this item");
    return;
  }

  const updated = await setFeatureRequestStatus(db, job.id, {
    status: "in_progress",
    expectedStatus: "pending",
    implementationNotes: plan.note,
  });
  if (!updated) {
    throw new Error(`operator job ${job.id} was not updated; it may have been claimed or removed`);
  }
  await logAudit(db, {
    actor: "operator-runner",
    tool: "operator_runner.claim",
    input: { jobId: job.id },
    output: { decision: plan.decision, nextStatus: plan.nextStatus, commandCount: plan.commands.length },
    success: true,
  });

  if (shouldRun) {
    const run = await runVerificationCommands(plan.commands, {
      cwd: process.cwd(),
      timeoutMs: commandTimeoutMs,
    });
    const reportPath = await writeOperatorRunReport(plan.jobId, run);
    const summary = formatOperatorVerificationSummary(run, reportPath);
    await setFeatureRequestStatus(db, job.id, {
      status: "in_progress",
      expectedStatus: "in_progress",
      implementationNotes: `${plan.note}\n${summary}`,
    });
    await logAudit(db, {
      actor: "operator-runner",
      tool: "operator_runner.verify",
      input: { jobId: job.id, commandCount: plan.commands.length },
      output: {
        success: run.success,
        failedCommand: run.failedCommand ?? null,
        reportPath,
        durationMs: run.durationMs,
      },
      success: run.success,
      error: run.success ? undefined : run.failureSummary,
      durationMs: run.durationMs,
    });
    console.log(`mode=mutated status=in_progress verification=${run.success ? "passed" : "failed"}`);
    console.log(`report=${reportPath}`);
    if (!run.success) process.exitCode = 1;
    return;
  }

  console.log("mode=mutated status=in_progress");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    if (dryRun && isDatabaseUrlError(error)) {
      console.log(formatOfflineOperatorRunReport());
      return;
    }
    console.error(formatOperatorRunnerError(error));
    process.exitCode = 1;
  });
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d[\s().-]?){8,}\d/g;
const TOKEN_RE = /\b(?:(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{8,}|(?:sk|pk|ghp|xox[baprs]?|ya29|eyJ)[A-Za-z0-9._-]{12,})\b/g;
const POSTGRES_URL_RE = /\bpostgres(?:ql)?:\/\/\S+/gi;

export function formatOperatorQueueDoctorReport(env: EnvLike = process.env): string {
  const databaseReady = Boolean(env.DATABASE_URL?.trim());
  const railwayReady = Boolean(env.RAILWAY_TOKEN?.trim());
  const googleReady = Boolean(env.GOOGLE_CREDENTIALS_JSON?.trim() || env.GOOGLE_TOKEN_JSON?.trim());
  const microsoftReady = Boolean(env.MS_CLIENT_ID?.trim() || env.MS_TOKEN_JSON?.trim());
  const spotifyReady = Boolean(
    env.SPOTIFY_CLIENT_ID?.trim() &&
      env.SPOTIFY_CLIENT_SECRET?.trim() &&
      env.SPOTIFY_REDIRECT_URI?.trim(),
  );

  return [
    "operator-queue-doctor",
    `live_queue_access=${databaseReady ? "ready" : "missing_DATABASE_URL"}`,
    `railway_cli_token=${railwayReady ? "configured" : "not_configured"}`,
    "",
    "What this means:",
    databaseReady
      ? "- I can read the live feature queue from this terminal."
      : "- I cannot read or claim live pending feature rows from this terminal yet.",
    "- This report shows setup status without printing secrets.",
    "- I can still safely improve local WhatsApp routing, help/status wording, tests, setup pages, and release gates.",
    "",
    "Provider setup signals:",
    `- Google/Gmail/Drive/Photos: ${googleReady ? "some Google credential/token present" : "needs Google OAuth credentials/token"}`,
    `- Microsoft/Outlook/OneDrive: ${microsoftReady ? "some Microsoft app/token present" : "needs Microsoft app/token"}`,
    `- Spotify: ${spotifyReady ? "OAuth app configured; account connection may still be needed" : "needs Spotify OAuth env vars"}`,
    "- Bank feeds: needs a compliant provider and consent flow.",
    "- Phone/SMS: needs a compliant provider or phone companion plus confirmation gates.",
    "",
    "Unlock live queue work:",
    "1. Add DATABASE_URL to .env.local or apps/dashboard/.env.local.",
    "2. Run pnpm operator:next to preview the highest-priority row.",
    "3. Run pnpm operator:claim only when the preview is safe.",
  ].join("\n");
}

export function formatOfflineOperatorRunReport(): string {
  return [
    "operator-queue=unavailable",
    "reason=DATABASE_URL is not configured",
    "mode=offline-safe-dry-run",
    "No queue state was changed.",
    "",
    "Safe next actions without live queue access:",
    "1. pnpm lint",
    "2. pnpm typecheck",
    "3. pnpm test",
    "4. pnpm build",
    "5. Fix local-only WhatsApp/router/docs issues with tests, then commit.",
    "6. Extend WhatsApp queued-integration routing for Gmail/Outlook, Drive/OneDrive, Google Photos, Spotify, phone/SMS, bank feeds, birthdays, and social videos.",
    "7. Improve WhatsApp status/help wording so users know what is ready, draft-only, setup-needed, or blocked.",
    "",
    "Needs DATABASE_URL: reading, claiming, rejecting, or updating live queued feature rows.",
    "",
    "Run pnpm operator:doctor for a setup-specific queue access report.",
  ].join("\n");
}

export function formatOperatorRunnerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isDatabaseUrlError(error)) {
    return [
      "operator-runner failed: Operator runner cannot read queued work because DATABASE_URL is not configured.",
      "Copy the dashboard DATABASE_URL into .env.local or apps/dashboard/.env.local, then rerun pnpm operator:next.",
      "No queue state was changed.",
    ].join("\n");
  }
  const redacted = redact(message);
  return `operator-runner failed: ${redacted.slice(0, 200)}`;
}

function redact(value: string): string {
  return value
    .replace(POSTGRES_URL_RE, "[redacted:database-url]")
    .replace(EMAIL_RE, "[redacted:email]")
    .replace(TOKEN_RE, "[redacted:token]")
    .replace(PHONE_RE, "[redacted:phone]");
}

export interface VerificationCommandResult {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  outputTail: string;
}

export interface OperatorVerificationRun {
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  commands: VerificationCommandResult[];
  failedCommand?: string;
  failureSummary?: string;
}

export async function runVerificationCommands(
  commands: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<OperatorVerificationRun> {
  const startedAtDate = new Date();
  const results: VerificationCommandResult[] = [];

  for (const command of commands) {
    const result = await runShellCommand(command, options);
    results.push(result);
    if (result.exitCode !== 0 || result.timedOut) {
      const completedAtDate = new Date();
      return {
        success: false,
        startedAt: startedAtDate.toISOString(),
        completedAt: completedAtDate.toISOString(),
        durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
        commands: results,
        failedCommand: command,
        failureSummary: result.timedOut
          ? `${command} timed out after ${options.timeoutMs}ms`
          : `${command} exited with ${result.exitCode}`,
      };
    }
  }

  const completedAtDate = new Date();
  return {
    success: true,
    startedAt: startedAtDate.toISOString(),
    completedAt: completedAtDate.toISOString(),
    durationMs: completedAtDate.getTime() - startedAtDate.getTime(),
    commands: results,
  };
}

export function formatOperatorVerificationSummary(run: OperatorVerificationRun, reportPath: string): string {
  const status = run.success ? "passed" : "failed";
  const failed = run.failedCommand ? ` Failed command: ${run.failedCommand}.` : "";
  return `Operator verification ${status}. Commands run: ${run.commands.length}.${failed} Report: ${reportPath}`;
}

async function writeOperatorRunReport(jobId: string, run: OperatorVerificationRun): Promise<string> {
  const dir = ".nitsyclaw-local/operator-runs";
  await mkdir(dir, { recursive: true });
  const safeId = jobId.replace(/[^a-z0-9-]/gi, "").slice(0, 64) || "operator-job";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${dir}/${stamp}-${safeId}.json`;
  await writeFile(path, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return path;
}

function runShellCommand(
  command: string,
  options: { cwd: string; timeoutMs: number },
): Promise<VerificationCommandResult> {
  const startedAt = Date.now();
  const parsed = parseVerificationCommand(command);
  if (!parsed) {
    return Promise.resolve({
      command,
      exitCode: 1,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      outputTail: "Rejected unsafe or unsupported verification command.",
    });
  }

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- verification commands are allowlisted above and run with shell:false.
    const child = spawn(parsed.executable, parsed.args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const append = (chunk: Buffer) => {
      output += redact(String(chunk));
      if (output.length > 12_000) output = output.slice(-12_000);
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        command,
        exitCode: null,
        timedOut: true,
        durationMs: Date.now() - startedAt,
        outputTail: output,
      });
    }, options.timeoutMs);

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command,
        exitCode,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        outputTail: output,
      });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        command,
        exitCode: 1,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        outputTail: redact(error.message),
      });
    });
  });
}

function parseVerificationCommand(command: string): { executable: string; args: string[] } | null {
  const trimmed = command.trim();
  if (ALLOWED_VERIFICATION_COMMANDS.has(trimmed)) return splitCommand(trimmed);

  if (process.env.NODE_ENV === "test" && /^node -e "[-A-Za-z0-9\s().;'_]+ "$/.test(`${trimmed} `)) {
    return splitCommand(trimmed);
  }
  if (process.env.NODE_ENV === "test" && /^node -e "[-A-Za-z0-9\s().;'_]+"$/.test(trimmed)) {
    return splitCommand(trimmed);
  }

  return null;
}

function splitCommand(command: string): { executable: string; args: string[] } | null {
  const parts = command.match(/"[^"]*"|\S+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
  const rawExecutable = parts[0];
  const executable = process.platform === "win32" && rawExecutable === "pnpm" ? "pnpm.cmd" : rawExecutable;
  if (!executable) return null;
  return { executable, args: parts.slice(1) };
}

function isDatabaseUrlError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("DATABASE_URL");
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
