import { desc, eq, or } from "drizzle-orm";
import {
  auditLog,
  commandJobs,
  featureRequests,
  getDb,
  getSystemHeartbeat,
} from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { evaluateCustomerInstanceReadiness } from "@nitsyclaw/shared/customer-instance";
import { evaluateSaleReadiness } from "./sale-readiness";
import {
  buildDashboardRuntimeMetadata,
  runtimeCommitMismatch,
} from "./runtime-identity";

export interface ReleaseWarRoomSummary {
  generatedAt: string;
  dashboardCommit: string;
  dashboardDeploymentId?: string;
  botCommit: string;
  botFreshness: string;
  whatsappFreshness: string;
  whatsappSendFreshness: string;
  loopGuardStatus: string;
  latestAudit: string | null;
  queue: {
    p0p1Open: number;
    pending: number;
    inProgress: number;
    oldestOpenHours: number;
  };
  commandJobs: {
    failed: number;
    retrying: number;
    working: number;
  };
  sale: {
    privateUseScore: number;
    publicSaleScore: number;
    canSellPublicly: boolean;
    blockers: string[];
  };
  proof: {
    serverSideGates: string[];
    phonePrompts: string[];
  };
  rollback: {
    currentCommit: string;
    currentDeployment: string;
    previousDeployment: string;
    migrationStatus: string;
    knownRisks: string[];
    commands: string[];
  };
  rollbackNotes: string[];
  status: "ready" | "watch" | "blocked";
}

export async function loadReleaseWarRoomSummary(
  env: Record<string, string | undefined> = process.env,
): Promise<ReleaseWarRoomSummary> {
  const db = getDb();
  const now = new Date();
  const runtime = buildDashboardRuntimeMetadata(env);
  const sale = evaluateSaleReadiness(env);
  const customer = evaluateCustomerInstanceReadiness({}, env);
  const [
    openQueue,
    commandRows,
    latestAuditRows,
    botRuntimeHeartbeat,
    whatsappHeartbeat,
    whatsappSendHeartbeat,
    whatsappLoopGuardHeartbeat,
  ] = await Promise.all([
    db
      .select()
      .from(featureRequests)
      .where(or(eq(featureRequests.status, "pending"), eq(featureRequests.status, "in_progress")))
      .limit(250),
    db.select().from(commandJobs).orderBy(desc(commandJobs.createdAt)).limit(100),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1),
    getSystemHeartbeat(db, "bot-runtime"),
    getSystemHeartbeat(db, "whatsapp-client"),
    getSystemHeartbeat(db, "whatsapp-send"),
    getSystemHeartbeat(db, "whatsapp-loop-guard"),
  ]);

  const queueP0P1 = openQueue.filter((row) => row.severity === "P0" || row.severity === "P1").length;
  const pending = openQueue.filter((row) => row.status === "pending").length;
  const inProgress = openQueue.filter((row) => row.status === "in_progress").length;
  const oldestOpenHours = openQueue.length
    ? Math.round(Math.max(...openQueue.map((row) => (now.getTime() - new Date(row.createdAt).getTime()) / 3_600_000)))
    : 0;
  const commandCounts = commandRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const botFreshness = classifyHeartbeat(botRuntimeHeartbeat, now, 30 * 24 * 60 * 60 * 1000);
  const whatsappFreshness = classifyHeartbeat(whatsappHeartbeat, now, 2 * 60 * 1000);
  const whatsappSendFreshness = classifyHeartbeat(whatsappSendHeartbeat, now, 10 * 60 * 1000);
  const loopGuardStatus = whatsappLoopGuardHeartbeat?.status ?? "missing";
  const botCommit = heartbeatText(botRuntimeHeartbeat, "commitShort") ?? heartbeatText(botRuntimeHeartbeat, "commit") ?? "unknown";
  const mismatch = runtimeCommitMismatch(runtime.commit, botRuntimeHeartbeat);
  const blockers = [...sale.blockers, ...customer.blockers].filter((value, index, values) => values.indexOf(value) === index);
  const previousDeployment = cleanEnv(env.NITSYCLAW_PREVIOUS_DASHBOARD_DEPLOYMENT_URL)
    ?? cleanEnv(env.VERCEL_PREVIOUS_DEPLOYMENT_URL)
    ?? "Not recorded. Use npx vercel ls nitsyclaw and choose the most recent prior Ready production deployment.";
  const rollbackMigrationStatus = cleanEnv(env.NITSYCLAW_RELEASE_MIGRATION_STATUS)
    ?? "Not recorded. Treat schema rollback as unknown until the deploy handoff confirms no migration or names the exact backout plan.";
  const troubleSignals = [
    whatsappFreshness !== "ok",
    whatsappSendFreshness !== "ok" || whatsappSendHeartbeat?.status === "error",
    loopGuardStatus === "paused",
    mismatch,
    queueP0P1 > 0,
    (commandCounts.failed ?? 0) > 0,
    sale.mode === "public-sale" && !sale.ready,
  ].filter(Boolean).length;

  return {
    generatedAt: now.toISOString(),
    dashboardCommit: runtime.commitShort,
    dashboardDeploymentId: runtime.deploymentId,
    botCommit,
    botFreshness,
    whatsappFreshness,
    whatsappSendFreshness,
    loopGuardStatus,
    latestAudit: latestAuditRows[0]
      ? `${latestAuditRows[0].tool} ${latestAuditRows[0].success ? "passed" : "failed"}`
      : null,
    queue: {
      p0p1Open: queueP0P1,
      pending,
      inProgress,
      oldestOpenHours,
    },
    commandJobs: {
      failed: commandCounts.failed ?? 0,
      retrying: commandCounts.retrying ?? 0,
      working: commandCounts.working ?? 0,
    },
    sale: {
      privateUseScore: sale.privateUseScore,
      publicSaleScore: sale.publicSaleScore,
      canSellPublicly: sale.ready && customer.canSellPublicly,
      blockers,
    },
    proof: {
      serverSideGates: [
        "pnpm run whatsapp:release-gate",
        "pnpm run release:wait-railway",
        "pnpm run release:post-deploy-proof",
      ],
      phonePrompts: [
        "proof test",
        "proof details",
        "I spent $6.50 at Chemist Warehouse for medicine",
        "what can you do",
        "build all pending features",
      ],
    },
    rollback: {
      currentCommit: runtime.commitShort,
      currentDeployment: runtime.deploymentId ?? "unknown",
      previousDeployment,
      migrationStatus: rollbackMigrationStatus,
      knownRisks: rollbackRisks({
        mismatch,
        queueP0P1,
        commandFailures: commandCounts.failed ?? 0,
        whatsappFreshness,
        whatsappSendFreshness,
        loopGuardStatus,
        blockers,
      }),
      commands: [
        "npx vercel ls nitsyclaw --cwd \"C:\\Users\\Nitesh\\projects\\NitsyClaw\"",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl \"<previous-ready-production-url>\"",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl \"<previous-ready-production-url>\" -DryRun:$false",
        "pnpm release:live-smoke",
      ],
    },
    rollbackNotes: [
      "In Railway, promote the previous successful deployment if the WhatsApp worker breaks.",
      "For dashboard rollback, use the checked rollback helper against the previous ready deployment.",
      "If WhatsApp is unhealthy, inspect the fatal log line before restarting.",
    ],
    status: troubleSignals === 0 ? "ready" : troubleSignals <= 2 ? "watch" : "blocked",
  };
}

function rollbackRisks(input: {
  mismatch: boolean;
  queueP0P1: number;
  commandFailures: number;
  whatsappFreshness: string;
  whatsappSendFreshness: string;
  loopGuardStatus: string;
  blockers: string[];
}): string[] {
  const risks = [
    input.mismatch ? "Dashboard and WhatsApp worker commits differ." : null,
    input.queueP0P1 > 0 ? `${input.queueP0P1} open P0/P1 queue item(s).` : null,
    input.commandFailures > 0 ? `${input.commandFailures} failed command job(s).` : null,
    input.whatsappFreshness !== "ok" ? `WhatsApp client freshness is ${input.whatsappFreshness}.` : null,
    input.whatsappSendFreshness !== "ok" ? `WhatsApp send freshness is ${input.whatsappSendFreshness}.` : null,
    input.loopGuardStatus === "paused" ? "WhatsApp loop guard is paused." : null,
    ...input.blockers.slice(0, 3),
  ].filter((risk): risk is string => Boolean(risk));

  return risks.length ? risks : ["No active rollback-specific risk detected by the release war room."];
}

function cleanEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function heartbeatText(
  heartbeat: { metadata: Record<string, unknown> | null } | null,
  key: string,
): string | null {
  const value = heartbeat?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.slice(0, 120) : null;
}
