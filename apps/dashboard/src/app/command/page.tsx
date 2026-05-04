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

      <section className="grid gap-4 md:grid-cols-5">
        {metric("Approvals", data?.pendingConfirmations ?? "-", "/confirmations")}
        {metric("Reminders", data?.pendingReminders ?? "-", "/reminders")}
        {metric("Queue", pendingQueue, "/queue?status=pending")}
        {metric("Building", inProgressQueue, "/queue?status=in_progress")}
        {metric("WhatsApp", whatsapp?.status ?? "unknown", "/health")}
      </section>

      <OperatorCommandClient />

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
