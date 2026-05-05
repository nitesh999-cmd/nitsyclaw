import { getDb, messages, reminders, confirmations, featureRequests, auditLog, getSystemHeartbeat } from "@nitsyclaw/shared/db";
import { classifyHeartbeat } from "@nitsyclaw/shared/ops/heartbeat";
import { desc, eq } from "drizzle-orm";
import { evaluateSaleReadiness } from "../../lib/sale-readiness";

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
  };
}

function status(ok: boolean) {
  return ok ? "text-emerald-300" : "text-red-300";
}

export default async function HealthPage() {
  let data: Awaited<ReturnType<typeof loadHealth>> | null = null;
  let error: string | null = null;
  const saleReadiness = evaluateSaleReadiness();
  try {
    data = await loadHealth();
  } catch (e) {
    console.error("[health] load failed", e);
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

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Operations</div>
        <h2 className="mt-2 text-3xl font-semibold">Health</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Operational status without exposing secrets.</p>
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
        <section className="grid gap-4 md:grid-cols-4">
          <div className="nc-tile">
            <div className="nc-eyebrow">Last message</div>
            <div className="mt-2 text-sm">{data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}</div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Pending reminders</div>
            <div className="mt-2 text-2xl">{data.pendingReminders}</div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Pending confirmations</div>
            <div className="mt-2 text-2xl">{data.pendingConfirmations}</div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Feature queue</div>
            <div className="mt-2 text-sm text-slate-300">
              {Object.entries(data.queueCounts).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Empty"}
            </div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">WhatsApp client</div>
            <div className={data.whatsappFreshness === "ok" && data.whatsappHeartbeat?.status === "ok" ? "mt-2 text-emerald-300" : "mt-2 text-red-300"}>
              {data.whatsappHeartbeat?.status ?? data.whatsappFreshness}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data.whatsappHeartbeat ? new Date(data.whatsappHeartbeat.lastSeenAt).toLocaleString() : "No heartbeat"}
            </div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Bot scheduler</div>
            <div className={data.schedulerFreshness === "ok" ? "mt-2 text-emerald-300" : "mt-2 text-red-300"}>
              {data.schedulerFreshness}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data.schedulerHeartbeat ? new Date(data.schedulerHeartbeat.lastSeenAt).toLocaleString() : "No heartbeat"}
            </div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Local watchdog</div>
            <div className={data.watchdogFreshness === "ok" && data.watchdogHeartbeat?.status !== "error" ? "mt-2 text-emerald-300" : "mt-2 text-red-300"}>
              {data.watchdogHeartbeat?.status === "restarting" ? "restarting" : data.watchdogFreshness}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data.watchdogHeartbeat ? new Date(data.watchdogHeartbeat.lastSeenAt).toLocaleString() : "No heartbeat"}
            </div>
          </div>
          <div className="nc-tile">
            <div className="nc-eyebrow">Reminder sweep</div>
            <div className={data.reminderFreshness === "ok" && data.reminderHeartbeat?.status !== "error" ? "mt-2 text-emerald-300" : "mt-2 text-red-300"}>
              {data.reminderHeartbeat?.status === "error" ? "error" : data.reminderFreshness}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data.reminderHeartbeat ? new Date(data.reminderHeartbeat.lastSeenAt).toLocaleString() : "No heartbeat"}
            </div>
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
