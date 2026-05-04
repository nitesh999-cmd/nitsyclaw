import { existsSync, readFileSync } from "node:fs";
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
const shouldClaim = args.has("--claim");
const shouldRejectUnsafe = args.has("--reject-unsafe");
const dryRun = args.has("--dry-run") || (!shouldClaim && !shouldRejectUnsafe);

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
  console.log("mode=mutated status=in_progress");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`operator-runner failed: ${message}`);
  process.exitCode = 1;
});

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
