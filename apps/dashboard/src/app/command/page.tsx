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
    <div className="border border-neutral-800 p-4 hover:border-neutral-700">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl text-neutral-100">{value}</div>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export default async function CommandPage() {
  let data: Awaited<ReturnType<typeof loadOperatorState>> | null = null;
  let unavailable = false;

  try {
    data = await Promise.race([loadOperatorState(), timeoutOperatorState(3500)]);
    unavailable = data === null;
  } catch (e) {
    console.error("[command] load failed", e);
    unavailable = true;
  }

  const pendingQueue = data?.queueCounts.pending ?? 0;
  const inProgressQueue = data?.queueCounts.in_progress ?? 0;
  const operatorMissionCount = data?.operatorMissions.length ?? 0;
  const next50Count = data?.next50Missions.length ?? 0;
  const whatsapp = data?.heartbeats.find((row) => row.source === "whatsapp-client");
  const loopGuard = data?.heartbeats.find((row) => row.source === "whatsapp-loop-guard");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Operator Command</h2>
        <p className="max-w-3xl text-sm text-neutral-400">
          Control surface for hard commands, build requests, bugs, location, approvals, and the next operator upgrades.
        </p>
      </div>

      {unavailable ? (
        <div className="border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-100">
          Command state is unavailable. Check server logs.
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

      <section className="border border-neutral-800 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase text-neutral-500">Operator program</div>
            <div className="mt-1 text-sm text-neutral-300">
              {operatorMissionCount} of {OPERATOR_MISSIONS.length} top missions are in the durable queue.
            </div>
          </div>
          <a href="/queue" className="text-sm text-sky-300 hover:text-sky-200">
            Open queue
          </a>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {data?.operatorMissions.slice(0, 6).map((mission) => (
            <div key={mission.id} className="border border-neutral-900 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-500">{mission.severity ?? "P2"}</div>
                <div className="text-xs text-neutral-400">{mission.status}</div>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-neutral-300">{mission.description}</div>
            </div>
          ))}
          {operatorMissionCount === 0 ? (
            <div className="border border-neutral-900 p-3 text-sm text-neutral-500">
              No operator missions queued yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-neutral-800 p-4">
        <div className="text-xs uppercase text-neutral-500">Local runner</div>
        <div className="mt-2 text-sm text-neutral-300">
          Use the laptop runner for real queue execution. It previews by default and only mutates queue state with an explicit mode.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["pnpm operator:next", "pnpm operator:claim", "pnpm operator:reject-unsafe"].map((command) => (
            <code key={command} className="border border-neutral-900 bg-neutral-950 p-3 text-xs text-neutral-200">
              {command}
            </code>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-neutral-800 p-4">
          <div className="text-xs uppercase text-neutral-500">Loop guard</div>
          <div className="mt-2 text-sm text-neutral-300">{loopGuard?.status ?? "unknown"}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {loopGuard ? new Date(loopGuard.lastSeenAt).toLocaleString() : "No heartbeat"}
          </div>
        </div>

        <div className="border border-neutral-800 p-4">
          <div className="text-xs uppercase text-neutral-500">Last message</div>
          <div className="mt-2 text-sm text-neutral-300">
            {data?.latestMessage ? new Date(data.latestMessage.createdAt).toLocaleString() : "None"}
          </div>
        </div>

        <div className="border border-neutral-800 p-4">
          <div className="text-xs uppercase text-neutral-500">Latest tools</div>
          <div className="mt-2 space-y-1 text-xs text-neutral-400">
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
