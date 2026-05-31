import type { ReactNode } from "react";
import {
  getDb,
  messages,
  reminders,
  confirmations,
  featureRequests,
  auditLog,
  commandJobs,
  dashboardAuthAttempts,
  getSystemHeartbeat,
} from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { desc, eq } from "drizzle-orm";
import { evaluateSaleReadiness } from "../../lib/sale-readiness";
import { logDashboardError } from "../../lib/dashboard-runtime";
import { loadDashboardProviderHealth } from "../../lib/provider-health";
import {
  buildDashboardRuntimeMetadata,
  runtimeCommitMismatch,
} from "../../lib/runtime-identity";
import { buildOpsSloDashboard, heartbeatAgeMinutes, p95 } from "../../lib/ops-slo";

export const dynamic = "force-dynamic";

async function loadHealth() {
  const db = getDb();
  const [
    lastMessageRows,
    pendingReminderRows,
    pendingConfirmationRows,
    queueRows,
    commandJobRows,
    latestAuditRows,
    recentAuditRows,
    authAttemptRows,
    botRuntimeHeartbeat,
    whatsappHeartbeat,
    whatsappSendHeartbeat,
    whatsappLoopGuardHeartbeat,
    watchdogHeartbeat,
    schedulerHeartbeat,
    reminderHeartbeat,
    prunerHeartbeat,
    liveSmokeHeartbeat,
  ] = await Promise.all([
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
    db.select().from(reminders).where(eq(reminders.status, "pending")).limit(25),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(25),
    db.select().from(featureRequests).limit(200),
    db.select().from(commandJobs).orderBy(desc(commandJobs.createdAt)).limit(100),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200),
    db.select().from(dashboardAuthAttempts).limit(100),
    getSystemHeartbeat(db, "bot-runtime"),
    getSystemHeartbeat(db, "whatsapp-client"),
    getSystemHeartbeat(db, "whatsapp-send"),
    getSystemHeartbeat(db, "whatsapp-loop-guard"),
    getSystemHeartbeat(db, "local-watchdog"),
    getSystemHeartbeat(db, "bot-scheduler"),
    getSystemHeartbeat(db, "reminder-sweep"),
    getSystemHeartbeat(db, "memory-pruner"),
    getSystemHeartbeat(db, "live-smoke"),
  ]);
  const providerHealth = await loadDashboardProviderHealth();
  const integrationReadiness = providerHealth.readiness;
  const queueCounts = queueRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const commandJobCounts = commandJobRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const now = new Date();
  const dayAgoMs = now.getTime() - 24 * 60 * 60 * 1000;
  const pendingQueueRows = queueRows.filter((row) => row.status === "pending" || row.status === "in_progress");
  const oldestQueueAgeHours = pendingQueueRows.length
    ? Math.max(...pendingQueueRows.map((row) => (now.getTime() - new Date(row.createdAt).getTime()) / (60 * 60 * 1000)))
    : 0;
  const recentFailureRows = recentAuditRows.filter((row) => !row.success && new Date(row.createdAt).getTime() >= dayAgoMs);
  const recentAuditRows24h = recentAuditRows.filter((row) => new Date(row.createdAt).getTime() >= dayAgoMs);
  const slowAuditRows = recentAuditRows.filter((row) => (row.durationMs ?? 0) >= 2_000 && new Date(row.createdAt).getTime() >= dayAgoMs);
  const apiP95LatencyMs = p95(recentAuditRows24h.map((row) => row.durationMs ?? -1));
  const failedToolRate = recentAuditRows24h.length ? recentFailureRows.length / recentAuditRows24h.length : null;
  const activeAuthLockouts = authAttemptRows.filter((row) => row.lockedUntil && new Date(row.lockedUntil).getTime() > now.getTime()).length;
  const authFailureRows = authAttemptRows.filter((row) => row.failures > 0).length;
  return {
    database: true,
    dashboardRuntime: buildDashboardRuntimeMetadata(process.env),
    lastMessage: lastMessageRows[0] ?? null,
    pendingReminders: pendingReminderRows.length,
    pendingConfirmations: pendingConfirmationRows.length,
    queueCounts,
    oldestQueueAgeHours,
    recentFailures24h: recentFailureRows.length,
    apiP95LatencyMs,
    failedToolRate,
    slowCalls24h: slowAuditRows.length,
    slowCallMaxMs: slowAuditRows.reduce((max, row) => Math.max(max, row.durationMs ?? 0), 0),
    activeAuthLockouts,
    authFailureRows,
    commandJobCounts,
    latestAudit: latestAuditRows[0] ?? null,
    integrationReadiness,
    botRuntimeHeartbeat,
    botRuntimeFreshness: classifyHeartbeat(botRuntimeHeartbeat, new Date(), 30 * 24 * 60 * 60 * 1000),
    whatsappHeartbeat,
    whatsappFreshness: classifyHeartbeat(whatsappHeartbeat, new Date(), 2 * 60 * 1000),
    whatsappSendHeartbeat,
    whatsappSendFreshness: classifyHeartbeat(whatsappSendHeartbeat, new Date(), 10 * 60 * 1000),
    whatsappLoopGuardHeartbeat,
    whatsappLoopGuardFreshness: classifyHeartbeat(whatsappLoopGuardHeartbeat, new Date(), 10 * 60 * 1000),
    watchdogHeartbeat,
    watchdogFreshness: classifyHeartbeat(watchdogHeartbeat, new Date(), 6 * 60 * 1000),
    schedulerHeartbeat,
    schedulerFreshness: classifyHeartbeat(schedulerHeartbeat, new Date()),
    reminderHeartbeat,
    reminderFreshness: classifyHeartbeat(reminderHeartbeat, new Date()),
    prunerHeartbeat,
    prunerFreshness: classifyHeartbeat(prunerHeartbeat, new Date(), 26 * 60 * 60 * 1000), // daily — stale after 26h
    liveSmokeHeartbeat,
    liveSmokeFreshness: classifyHeartbeat(liveSmokeHeartbeat, new Date(), 24 * 60 * 60 * 1000),
  };
}

function status(ok: boolean) {
  return ok ? "text-emerald-300" : "text-red-300";
}

function operationsStatus(args: {
  whatsappStale: boolean;
  whatsappSendFailure: boolean;
  whatsappLoopPaused: boolean;
  botVersionMismatch: boolean;
  commandJobTrouble: boolean;
  oldestQueueAgeHours: number;
  recentFailures24h: number;
  slowCalls24h: number;
  activeAuthLockouts: number;
}) {
  const failures = [
    args.whatsappStale,
    args.whatsappSendFailure,
    args.whatsappLoopPaused,
    args.botVersionMismatch,
    args.commandJobTrouble,
    args.oldestQueueAgeHours > 72,
    args.recentFailures24h > 10,
    args.slowCalls24h > 10,
    args.activeAuthLockouts > 0,
  ].filter(Boolean).length;
  if (failures === 0) return { label: "Healthy", className: "text-emerald-300", detail: "No current production warning signals." };
  if (failures <= 2) return { label: "Watch", className: "text-amber-300", detail: `${failures} signal(s) need attention.` };
  return { label: "Action needed", className: "text-red-300", detail: `${failures} production signal(s) need attention now.` };
}

function heartbeatMetadataText(
  heartbeat: { metadata: Record<string, unknown> | null } | null,
  key: string,
): string | null {
  const value = heartbeat?.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.slice(0, 180) : null;
}

function heartbeatDeployDetail(heartbeat: { metadata: Record<string, unknown> | null } | null): ReactNode {
  const commit = heartbeatMetadataText(heartbeat, "commitShort") ?? heartbeatMetadataText(heartbeat, "commit");
  const deployment = heartbeatMetadataText(heartbeat, "deploymentId");
  const startedAt = heartbeatMetadataText(heartbeat, "startedAt");

  if (!commit && !deployment && !startedAt) return "No deploy identity recorded";

  return (
    <>
      {commit ? <>Commit: {commit}</> : null}
      {deployment ? <>{commit ? " | " : ""}Deployment: {deployment}</> : null}
      {startedAt ? <>{commit || deployment ? " | " : ""}Started: {startedAt}</> : null}
    </>
  );
}

function HeartbeatTile({
  label,
  freshness,
  heartbeat,
  stale,
  reconnectCta,
  detail,
}: {
  label: string;
  freshness: string;
  heartbeat: { lastSeenAt: Date; status: string } | null;
  stale?: boolean;
  reconnectCta?: ReactNode;
  detail?: ReactNode;
}) {
  const ok = freshness === "ok" && heartbeat?.status !== "error";
  return (
    <div className="nc-tile">
      <div className="nc-eyebrow">{label}</div>
      <div className={ok ? "mt-2 text-emerald-300" : "mt-2 text-red-300"}>
        {heartbeat?.status === "restarting" ? "restarting" : heartbeat?.status === "error" ? "error" : freshness}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {heartbeat ? new Date(heartbeat.lastSeenAt).toLocaleString() : "No heartbeat"}
      </div>
      {detail ? <div className="mt-2 text-xs text-slate-400">{detail}</div> : null}
      {(stale || !ok) && reconnectCta ? (
        <div className="mt-2">{reconnectCta}</div>
      ) : null}
    </div>
  );
}

export default async function HealthPage() {
  let data: Awaited<ReturnType<typeof loadHealth>> | null = null;
  let error: string | null = null;
  const saleReadiness = evaluateSaleReadiness();
  try {
    data = await loadHealth();
  } catch (e) {
    logDashboardError("health.load", e);
    error = "Health check failed. Try again shortly.";
  }

  const rows = [
    ["Database", Boolean(data?.database), data ? "Reachable" : error ?? "Unavailable"],
    ["Anthropic", Boolean(process.env.ANTHROPIC_API_KEY), process.env.ANTHROPIC_API_KEY ? "Configured" : "Missing env"],
    ["OpenAI", Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY ? "Configured" : "Missing env"],
    ["WhatsApp owner", Boolean(process.env.WHATSAPP_OWNER_NUMBER), process.env.WHATSAPP_OWNER_NUMBER ? "Configured" : "Missing env"],
    ["Spotify env", Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI), "Optional integration"],
    [
      "Public sale",
      saleReadiness.ready,
      saleReadiness.mode === "public-sale"
        ? saleReadiness.ready
          ? "Ready"
          : `${saleReadiness.blockers.length} blocker(s)`
        : "Private-owner mode",
    ],
  ] as const;

  const whatsappStale = data ? data.whatsappFreshness !== "ok" || data.whatsappHeartbeat?.status !== "ok" : false;
  const whatsappSendFailure = data?.whatsappSendHeartbeat?.status === "error";
  const whatsappSendError = data ? heartbeatMetadataText(data.whatsappSendHeartbeat, "error") : null;
  const whatsappLoopPaused = data?.whatsappLoopGuardHeartbeat?.status === "paused";
  const whatsappLoopReason = data ? heartbeatMetadataText(data.whatsappLoopGuardHeartbeat, "reason") : null;
  const whatsappLoopResetAt = data ? heartbeatMetadataText(data.whatsappLoopGuardHeartbeat, "resetAt") : null;
  const botVersionMismatch = data ? runtimeCommitMismatch(data.dashboardRuntime.commit, data.botRuntimeHeartbeat) : false;
  const dashboardCommit = data?.dashboardRuntime.commitShort ?? "unknown";
  const botRuntimeCommit = data
    ? heartbeatMetadataText(data.botRuntimeHeartbeat, "commitShort") ?? heartbeatMetadataText(data.botRuntimeHeartbeat, "commit") ?? "unknown"
    : "unknown";
  const commandJobTrouble = Boolean(
    (data?.commandJobCounts.failed ?? 0) > 0 ||
    (data?.commandJobCounts.retrying ?? 0) > 0 ||
    (data?.commandJobCounts.working ?? 0) > 3,
  );
  const opsStatus = data
    ? operationsStatus({
        whatsappStale,
        whatsappSendFailure,
        whatsappLoopPaused,
        botVersionMismatch,
        commandJobTrouble,
        oldestQueueAgeHours: data.oldestQueueAgeHours,
        recentFailures24h: data.recentFailures24h,
        slowCalls24h: data.slowCalls24h,
        activeAuthLockouts: data.activeAuthLockouts,
      })
    : null;
  const opsSlo = buildOpsSloDashboard(data
    ? {
        dashboardOk: data.database,
        botFreshness: data.botRuntimeFreshness,
        botFreshMinutes: heartbeatAgeMinutes(data.botRuntimeHeartbeat, new Date()),
        queueOldestHours: data.oldestQueueAgeHours,
        apiP95LatencyMs: data.apiP95LatencyMs,
        failedToolRate: data.failedToolRate,
        liveSmokeFreshness: data.liveSmokeFreshness,
      }
    : {
        dashboardOk: false,
        botFreshness: "missing",
        botFreshMinutes: null,
        queueOldestHours: 0,
        apiP95LatencyMs: null,
        failedToolRate: null,
        liveSmokeFreshness: "missing",
      });

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Operations</div>
        <h2 className="mt-2 text-3xl font-semibold">Health</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Operational status without exposing secrets.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/whatsapp-recovery" className="nc-button-primary">WhatsApp recovery</a>
          <a href="/api/healthz" className="nc-button">Check API health</a>
        </div>
      </section>

      {whatsappStale && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-300">WhatsApp client appears disconnected</p>
              <p className="mt-1 text-xs text-amber-400/70">Last heartbeat is stale or status is not OK. Restart the bot process to reconnect.</p>
            </div>
            <a href="/api/healthz" className="nc-button min-h-8 px-3 text-xs">
              Check /healthz
            </a>
            <a href="/whatsapp-recovery" className="nc-button min-h-8 px-3 text-xs">
              Open recovery board
            </a>
          </div>
        </div>
      )}

      {whatsappSendFailure && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-red-300">WhatsApp reply delivery failed</p>
              <p className="mt-1 text-xs text-red-300/75">
                Last send failure: {whatsappSendError ?? "No detail available"}
              </p>
            </div>
            <a href="/health" className="nc-button min-h-8 px-3 text-xs">
              Refresh health
            </a>
            <a href="/whatsapp-recovery" className="nc-button min-h-8 px-3 text-xs">
              Open recovery board
            </a>
          </div>
        </div>
      )}

      {whatsappLoopPaused && (
        <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-red-300">WhatsApp loop guard paused replies</p>
              <p className="mt-1 text-xs text-red-300/75">
                Loop guard reason: {whatsappLoopReason ?? "No detail available"}
                {whatsappLoopResetAt ? ` | Auto-reset: ${whatsappLoopResetAt}` : ""}
              </p>
            </div>
            <a href="/health" className="nc-button min-h-8 px-3 text-xs">
              Refresh health
            </a>
            <a href="/whatsapp-recovery" className="nc-button min-h-8 px-3 text-xs">
              Open recovery board
            </a>
          </div>
        </div>
      )}

      {botVersionMismatch && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-300">Bot and dashboard are on different commits</p>
              <p className="mt-1 text-xs text-amber-400/70">
                Dashboard commit: {dashboardCommit} | Bot commit: {botRuntimeCommit}. Railway may not have redeployed the WhatsApp worker yet.
              </p>
            </div>
            <a href="/health" className="nc-button min-h-8 px-3 text-xs">
              Refresh health
            </a>
          </div>
        </div>
      )}

      {commandJobTrouble && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-300">Command jobs need attention</p>
              <p className="mt-1 text-xs text-amber-400/70">
                failed: {data?.commandJobCounts.failed ?? 0} | retrying: {data?.commandJobCounts.retrying ?? 0} | working: {data?.commandJobCounts.working ?? 0}
              </p>
            </div>
            <a href="/command" className="nc-button min-h-8 px-3 text-xs">
              Open command page
            </a>
          </div>
        </div>
      )}

      {data && opsStatus ? (
        <section className="nc-section" data-testid="admin-observability">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="nc-eyebrow">Admin observability</div>
              <h3 className={`mt-2 text-2xl font-semibold ${opsStatus.className}`}>{opsStatus.label}</h3>
              <p className="mt-1 text-sm text-slate-400">{opsStatus.detail}</p>
            </div>
            <a href="/api/healthz" className="nc-button">API health</a>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Queue age</div>
              <div className={data.oldestQueueAgeHours > 72 ? "mt-2 text-red-300" : "mt-2 text-slate-100"}>
                {Math.round(data.oldestQueueAgeHours)}h
              </div>
              <p className="mt-1 text-xs text-slate-500">Oldest pending or in-progress request.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Route failures</div>
              <div className={data.recentFailures24h > 10 ? "mt-2 text-red-300" : "mt-2 text-slate-100"}>
                {data.recentFailures24h}
              </div>
              <p className="mt-1 text-xs text-slate-500">Failed tool/API calls in the last 24h.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Slow calls</div>
              <div className={data.slowCalls24h > 10 ? "mt-2 text-red-300" : "mt-2 text-slate-100"}>
                {data.slowCalls24h}
              </div>
              <p className="mt-1 text-xs text-slate-500">Calls over 2s. Max {data.slowCallMaxMs}ms.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Auth lockouts</div>
              <div className={data.activeAuthLockouts > 0 ? "mt-2 text-red-300" : "mt-2 text-slate-100"}>
                {data.activeAuthLockouts}
              </div>
              <p className="mt-1 text-xs text-slate-500">{data.authFailureRows} login failure row(s) tracked.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Heartbeat</div>
              <div className={whatsappStale ? "mt-2 text-red-300" : "mt-2 text-slate-100"}>
                {whatsappStale ? "stale" : "ok"}
              </div>
              <p className="mt-1 text-xs text-slate-500">WhatsApp client freshness.</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="nc-eyebrow">Deployment</div>
              <div className={botVersionMismatch ? "mt-2 text-amber-300" : "mt-2 text-slate-100"}>
                {botVersionMismatch ? "mismatch" : "aligned"}
              </div>
              <p className="mt-1 text-xs text-slate-500">Dashboard vs bot commit check.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="nc-section" data-testid="admin-observability">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="nc-eyebrow">Admin observability</div>
              <h3 className="mt-2 text-2xl font-semibold text-amber-300">Setup needed</h3>
              <p className="mt-1 text-sm text-slate-400">
                Database-backed metrics are unavailable. The health page is rendering a safe fallback instead of exposing raw configuration details.
              </p>
            </div>
            <a href="/api/healthz" className="nc-button">API health</a>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Queue age", "unavailable", "Needs database access."],
              ["Route failures", "unavailable", "Needs audit log access."],
              ["Slow calls", "unavailable", "Needs audit log access."],
              ["Auth lockouts", "unavailable", "Needs auth attempt access."],
              ["Heartbeat", "unavailable", "Needs heartbeat access."],
              ["Deployment", "unknown", "Runtime identity is still shown below when available."],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="nc-eyebrow">{label}</div>
                <div className="mt-2 text-slate-100">{value}</div>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="nc-section" data-testid="ops-slo-dashboard">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="nc-eyebrow">Production SLOs</div>
              <h3 className={`mt-2 text-2xl font-semibold ${
                opsSlo.status === "healthy" ? "text-emerald-300" : opsSlo.status === "watch" ? "text-amber-300" : "text-red-300"
              }`}>
                {opsSlo.score}/100 {opsSlo.status === "healthy" ? "healthy" : opsSlo.status === "watch" ? "watch" : "action needed"}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Service-level indicators for availability, bot freshness, queue age, latency, failed tools, and smoke proof.
              </p>
            </div>
            <code className="rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs text-emerald-200">
              pnpm run whatsapp:prod-smoke
            </code>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {opsSlo.indicators.map((indicator) => (
              <div key={indicator.key} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="nc-eyebrow">{indicator.label}</div>
                    <div className={
                      indicator.tone === "good"
                        ? "mt-2 text-lg font-semibold text-emerald-300"
                        : indicator.tone === "watch"
                          ? "mt-2 text-lg font-semibold text-amber-300"
                          : "mt-2 text-lg font-semibold text-red-300"
                    }>
                      {indicator.value}
                    </div>
                  </div>
                  <span className={
                    indicator.passed
                      ? "rounded-full border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-300"
                      : "rounded-full border border-amber-900 bg-amber-950/40 px-2 py-1 text-xs text-amber-300"
                  }>
                    {indicator.passed ? "passing" : "check"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Target: {indicator.target}</p>
                <p className="mt-2 text-xs text-slate-400">{indicator.detail}</p>
              </div>
            ))}
          </div>
      </section>

      <div className="divide-y divide-slate-800 border-y border-slate-800 bg-slate-950/45">
        {rows.map(([label, ok, detail]) => (
          <div key={label} className="grid gap-3 px-4 py-3 md:grid-cols-[180px_120px_1fr]">
            <div className="font-medium">{label}</div>
            <div className={status(ok)}>{ok ? "OK" : "Needs setup"}</div>
            <div className="text-sm text-slate-400">{detail}</div>
          </div>
        ))}
      </div>

      {data ? (
        <section className="nc-section">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="nc-eyebrow">Integration health checks</div>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">Connected account readiness</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Shows configured pieces, missing pieces, token freshness, and safety limits without exposing secrets.
              </p>
            </div>
            <a href="/integrations" className="nc-button">Manage integrations</a>
          </div>
          <div className="mt-5 divide-y divide-slate-800 border-y border-slate-800">
            {data.integrationReadiness.map((item) => {
              const ok = item.status === "ready" || item.status === "partial";
              const blocked = item.status === "blocked" || item.status === "needs_account";
              return (
                <div key={item.key} className="grid gap-3 py-3 md:grid-cols-[170px_130px_1fr]">
                  <div className="font-medium text-slate-100">{item.label}</div>
                  <div className={ok ? "text-emerald-300" : blocked ? "text-amber-300" : "text-slate-400"}>
                    {item.status.replace(/_/g, " ")}
                  </div>
                  <div className="text-sm text-slate-400">
                    <p>{item.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Configured: {item.configured.length ? item.configured.join(", ") : "none detected"} | Missing: {item.missing.length ? item.missing.join(", ") : "none"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Health: {item.healthChecks.map((check) => `${check.name} ${check.status}`).join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Next: {item.nextStep}</p>
                    <p className="mt-1 text-xs text-slate-500">Safety: {item.safety}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="nc-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="nc-eyebrow">Operator recovery runbook</div>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">WhatsApp checks to run before calling it fixed</h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Use these commands after a bot change, deployment mismatch, or loop-breaker pause. They do not expose secrets.
            </p>
          </div>
          <a href="/whatsapp-recovery" className="nc-button-primary">
            Open recovery board
          </a>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-sm font-medium text-slate-200">1. Local proof</div>
            <code className="mt-3 block rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs text-emerald-200">
              pnpm run whatsapp:proof-local
            </code>
            <p className="mt-3 text-xs text-slate-500">Runs WhatsApp smoke plus focused loop, replay, pending-items, and risky-action tests.</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-sm font-medium text-slate-200">2. Railway worker preflight</div>
            <code className="mt-3 block rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs text-emerald-200">
              pnpm run railway:preflight
            </code>
            <p className="mt-3 text-xs text-slate-500">Checks the Railway CLI/token path before touching the WhatsApp worker deployment.</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-sm font-medium text-slate-200">3. Phone proof</div>
            <code className="mt-3 block rounded-md border border-slate-800 bg-black/30 px-3 py-2 text-xs text-emerald-200">
              resume whatsapp
            </code>
            <p className="mt-3 text-xs text-slate-500">Then send: hi, hear it, pending items, voice weather tomorrow, risky send-message test.</p>
          </div>
        </div>
      </section>

      {data ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="nc-tile">
            <div className="nc-eyebrow">Last message</div>
            <div className="mt-2 text-sm">{data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}</div>
          </div>
          <a href="/reminders" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
            <div className="nc-eyebrow">Pending reminders</div>
            <div className="mt-2 text-2xl">{data.pendingReminders}</div>
          </a>
          <a href="/confirmations" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
            <div className="nc-eyebrow">Pending confirmations</div>
            <div className="mt-2 text-2xl">{data.pendingConfirmations}</div>
          </a>
          <a href="/queue" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
            <div className="nc-eyebrow">Feature queue</div>
            <div className="mt-2 text-sm text-slate-300">
              {Object.entries(data.queueCounts).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Empty"}
            </div>
          </a>
          <a href="/command" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
            <div className="nc-eyebrow">Command jobs</div>
            <div className="mt-2 text-sm text-slate-300">
              {Object.entries(data.commandJobCounts).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Empty"}
            </div>
          </a>

          <HeartbeatTile
            label="Dashboard runtime"
            freshness="ok"
            heartbeat={null}
            detail={
              <>
                Commit: {data.dashboardRuntime.commitShort}
                {data.dashboardRuntime.deploymentId ? <> | Deployment: {data.dashboardRuntime.deploymentId}</> : null}
              </>
            }
          />
          <HeartbeatTile
            label="Bot runtime"
            freshness={data.botRuntimeFreshness}
            heartbeat={data.botRuntimeHeartbeat}
            detail={heartbeatDeployDetail(data.botRuntimeHeartbeat)}
          />
          <HeartbeatTile
            label="WhatsApp client"
            freshness={data.whatsappFreshness}
            heartbeat={data.whatsappHeartbeat}
            stale={whatsappStale}
            reconnectCta={
              <span className="text-xs text-amber-400">Restart bot to reconnect</span>
            }
          />
          <HeartbeatTile
            label="WhatsApp replies"
            freshness={data.whatsappSendFreshness}
            heartbeat={data.whatsappSendHeartbeat}
            stale={whatsappSendFailure}
            detail={whatsappSendError ? <>Last send failure: {whatsappSendError}</> : "No send failures recorded"}
          />
          <HeartbeatTile
            label="WhatsApp loop guard"
            freshness={data.whatsappLoopGuardFreshness}
            heartbeat={data.whatsappLoopGuardHeartbeat}
            stale={whatsappLoopPaused}
            detail={
              whatsappLoopReason
                ? <>Loop guard reason: {whatsappLoopReason}{whatsappLoopResetAt ? <> | Auto-reset: {whatsappLoopResetAt}</> : null}</>
                : "No loop guard pauses recorded"
            }
          />
          <HeartbeatTile
            label="Bot scheduler"
            freshness={data.schedulerFreshness}
            heartbeat={data.schedulerHeartbeat}
          />
          <HeartbeatTile
            label="Local watchdog"
            freshness={data.watchdogFreshness}
            heartbeat={data.watchdogHeartbeat}
          />
          <HeartbeatTile
            label="Reminder sweep"
            freshness={data.reminderFreshness}
            heartbeat={data.reminderHeartbeat}
          />
          <HeartbeatTile
            label="Memory pruner"
            freshness={data.prunerFreshness}
            heartbeat={data.prunerHeartbeat}
          />

          <div className="nc-section md:col-span-4">
            <div className="nc-eyebrow">WhatsApp phone proof</div>
            <div className="mt-2 grid gap-2 text-sm text-slate-300 md:grid-cols-5">
              {["hi", "hear it", "pending items", "voice: weather tomorrow", "risky: send a message"].map((item) => (
                <div key={item} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Use these five checks after a deploy. If any one fails, fix that path before adding more features.
            </p>
          </div>

          <div className="nc-section md:col-span-4">
            <div className="nc-eyebrow">Latest tool signal</div>
            <div className="mt-2 text-sm text-slate-300">
              {data.latestAudit
                ? `${data.latestAudit.tool} - ${data.latestAudit.success ? "success" : "failed"} - ${new Date(data.latestAudit.createdAt).toLocaleString()}`
                : "No tool calls logged"}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
