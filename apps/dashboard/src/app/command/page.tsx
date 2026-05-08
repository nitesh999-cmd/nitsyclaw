import {
  auditLog,
  confirmations,
  featureRequests,
  getDb,
  messages,
  reminders,
  systemHeartbeats,
} from "@nitsyclaw/shared/db";
import { desc, eq } from "drizzle-orm";
import { OperatorCommandClient } from "./operator-command-client";
import { OPERATOR_MISSIONS } from "./operator-missions";
import { OPERATOR_NEXT_50 } from "./operator-roadmap";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

async function loadOperatorState() {
  const db = getDb();
  const [
    pendingConfirmations,
    pendingReminders,
    queueRows,
    heartbeatRows,
    latestAuditRows,
    latestMessageRows,
  ] = await Promise.all([
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(20),
    db.select().from(reminders).where(eq(reminders.status, "pending")).limit(20),
    db.select().from(featureRequests).limit(200),
    db.select().from(systemHeartbeats),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(3),
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
  ]);

  return {
    pendingConfirmations: pendingConfirmations.length,
    pendingReminders: pendingReminders.length,
    queueCounts: queueRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
    operatorMissions: queueRows
      .filter((row) => row.dedupeKey?.startsWith("operator-mission:"))
      .map((row) => ({
        id: row.id,
        description: row.description,
        status: row.status,
        severity: row.severity,
        createdAt: row.createdAt,
      })),
    next50Missions: queueRows
      .filter((row) => row.dedupeKey?.startsWith("operator-next-50:"))
      .map((row) => ({
        id: row.id,
        description: row.description,
        status: row.status,
        severity: row.severity,
        createdAt: row.createdAt,
      })),
    heartbeats: heartbeatRows.map((row) => ({
      source: row.source,
      status: row.status,
      lastSeenAt: row.lastSeenAt,
    })),
    latestAudit: latestAuditRows,
    latestMessage: latestMessageRows[0] ?? null,
  };
}

function timeoutOperatorState(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

function metric(label: string, value: string | number, href?: string) {
  const body = (
    <div className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
      <div className="nc-eyebrow">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export default async function CommandPage() {
  let data: Awaited<ReturnType<typeof loadOperatorState>> | null = null;
  let unavailable = false;

  try {
    data = await Promise.race([loadOperatorState(), timeoutOperatorState(1500)]);
    unavailable = data === null;
  } catch (e) {
    logDashboardLoadError("command", e);
    unavailable = true;
  }

  const pendingQueue = data?.queueCounts.pending ?? 0;
  const inProgressQueue = data?.queueCounts.in_progress ?? 0;
  const operatorMissionCount = data?.operatorMissions.length ?? 0;
  const next50Count = data?.next50Missions.length ?? 0;
  const whatsapp = data?.heartbeats.find((row) => row.source === "whatsapp-client");
  const loopGuard = data?.heartbeats.find((row) => row.source === "whatsapp-loop-guard");

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="nc-eyebrow">Do desk</div>
            <h1 className="mt-2 text-3xl font-semibold">Plan work without losing it</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Send one instruction to the assistant, or save future work into Requests. Queued means saved and visible;
              it does not build code, send messages, or deploy by itself.
            </p>
          </div>
          <a href="/queue" className="nc-button-primary">Open requests</a>
        </div>
      </section>

      {unavailable ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm leading-6 text-red-200">
          Live command counts are not available right now. The page still explains the controls, but queuing needs the dashboard database connection to be healthy.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        {metric("Approvals", data?.pendingConfirmations ?? "-", "/confirmations")}
        {metric("Reminders", data?.pendingReminders ?? "-", "/reminders")}
        {metric("Queue", pendingQueue, "/queue?status=pending")}
        {metric("Building", inProgressQueue, "/queue?status=in_progress")}
        {metric("Missions", `${operatorMissionCount}/${OPERATOR_MISSIONS.length}`, "/queue")}
        {metric("Next 50", `${next50Count}/${OPERATOR_NEXT_50.length}`, "/queue")}
        {metric("WhatsApp", whatsapp?.status ?? "unknown", "/health")}
      </section>

      <OperatorCommandClient />

      <section className="nc-section">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="nc-eyebrow">Saved build work</div>
            <div className="mt-1 text-sm text-slate-400">
              {operatorMissionCount} of {OPERATOR_MISSIONS.length} top missions are in the durable queue.
            </div>
          </div>
          <a href="/queue" className="text-sm font-semibold text-[#d8b75d] hover:text-[#e8c76d]">
            Open requests
          </a>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {data?.operatorMissions.slice(0, 6).map((mission) => (
            <div key={mission.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">{mission.severity ?? "P2"}</div>
                <div className="text-xs text-slate-500">{mission.status}</div>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-slate-300">{mission.description}</div>
            </div>
          ))}
          {operatorMissionCount === 0 ? (
            <div className="nc-empty">
              No home upgrades queued yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="nc-section">
        <div className="nc-eyebrow">Laptop runner</div>
        <div className="mt-2 text-sm text-slate-400">
          Use the laptop runner for real queue execution. It previews by default and only mutates queue state with an explicit mode.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["pnpm operator:next", "pnpm operator:claim", "pnpm operator:reject-unsafe"].map((command) => (
            <code key={command} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-400">
              {command}
            </code>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="nc-tile">
          <div className="nc-eyebrow">Loop guard</div>
          <div className="mt-2 text-sm text-slate-300">{loopGuard?.status ?? "unknown"}</div>
          <div className="mt-1 text-xs text-slate-500">
            {loopGuard ? new Date(loopGuard.lastSeenAt).toLocaleString() : "No heartbeat"}
          </div>
        </div>

        <div className="nc-tile">
          <div className="nc-eyebrow">Last message</div>
          <div className="mt-2 text-sm text-slate-300">
            {data?.latestMessage ? new Date(data.latestMessage.createdAt).toLocaleString() : "None"}
          </div>
        </div>

        <div className="nc-tile">
          <div className="nc-eyebrow">Latest tools</div>
          <div className="mt-2 space-y-1 text-xs text-slate-400">
            {data?.latestAudit.length
              ? data.latestAudit.map((row) => (
                  <div key={row.id}>
                    {row.tool} - {row.success ? "ok" : "failed"}
                  </div>
                ))
              : "No tool calls"}
          </div>
        </div>
      </section>
    </div>
  );
}
