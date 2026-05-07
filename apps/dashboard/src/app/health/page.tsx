import type { ReactNode } from "react";
import { getDb, messages, reminders, confirmations, featureRequests, auditLog, getSystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { desc, eq } from "drizzle-orm";
import { evaluateSaleReadiness } from "../../lib/sale-readiness";
import { logDashboardError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

async function loadHealth() {
  const db = getDb();
  const [
    lastMessageRows,
    pendingReminderRows,
    pendingConfirmationRows,
    queueRows,
    latestAuditRows,
    whatsappHeartbeat,
    watchdogHeartbeat,
    schedulerHeartbeat,
    reminderHeartbeat,
    prunerHeartbeat,
  ] = await Promise.all([
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
    db.select().from(reminders).where(eq(reminders.status, "pending")).limit(25),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(25),
    db.select().from(featureRequests).limit(200),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1),
    getSystemHeartbeat(db, "whatsapp-client"),
    getSystemHeartbeat(db, "local-watchdog"),
    getSystemHeartbeat(db, "bot-scheduler"),
    getSystemHeartbeat(db, "reminder-sweep"),
    getSystemHeartbeat(db, "memory-pruner"),
  ]);
  const queueCounts = queueRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    database: true,
    lastMessage: lastMessageRows[0] ?? null,
    pendingReminders: pendingReminderRows.length,
    pendingConfirmations: pendingConfirmationRows.length,
    queueCounts,
    latestAudit: latestAuditRows[0] ?? null,
    whatsappHeartbeat,
    whatsappFreshness: classifyHeartbeat(whatsappHeartbeat, new Date(), 2 * 60 * 1000),
    watchdogHeartbeat,
    watchdogFreshness: classifyHeartbeat(watchdogHeartbeat, new Date(), 6 * 60 * 1000),
    schedulerHeartbeat,
    schedulerFreshness: classifyHeartbeat(schedulerHeartbeat, new Date()),
    reminderHeartbeat,
    reminderFreshness: classifyHeartbeat(reminderHeartbeat, new Date()),
    prunerHeartbeat,
    prunerFreshness: classifyHeartbeat(prunerHeartbeat, new Date(), 26 * 60 * 60 * 1000), // daily — stale after 26h
  };
}

function status(ok: boolean) {
  return ok ? "text-emerald-300" : "text-red-300";
}

function HeartbeatTile({
  label,
  freshness,
  heartbeat,
  stale,
  reconnectCta,
}: {
  label: string;
  freshness: string;
  heartbeat: { lastSeenAt: Date; status: string } | null;
  stale?: boolean;
  reconnectCta?: ReactNode;
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
    error = "Health check failed. Check server logs.";
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

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Operations</div>
        <h2 className="mt-2 text-3xl font-semibold">Health</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Operational status without exposing secrets.</p>
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
          </div>
        </div>
      )}

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
