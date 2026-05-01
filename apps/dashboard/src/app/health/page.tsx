import { getDb, messages, reminders, confirmations, featureRequests, auditLog } from "@nitsyclaw/shared/db";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadHealth() {
  const db = getDb();
  const [lastMessageRows, pendingReminderRows, pendingConfirmationRows, queueRows, latestAuditRows] = await Promise.all([
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
    db.select().from(reminders).where(eq(reminders.status, "pending")).limit(25),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(25),
    db.select().from(featureRequests).limit(200),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1),
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
  };
}

function status(ok: boolean) {
  return ok ? "text-emerald-300" : "text-red-300";
}

export default async function HealthPage() {
  let data: Awaited<ReturnType<typeof loadHealth>> | null = null;
  let error: string | null = null;
  try {
    data = await loadHealth();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const rows = [
    ["Database", Boolean(data?.database), data ? "Reachable" : error ?? "Unavailable"],
    ["Anthropic", Boolean(process.env.ANTHROPIC_API_KEY), process.env.ANTHROPIC_API_KEY ? "Configured" : "Missing env"],
    ["OpenAI", Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY ? "Configured" : "Missing env"],
    ["WhatsApp owner", Boolean(process.env.WHATSAPP_OWNER_NUMBER), process.env.WHATSAPP_OWNER_NUMBER ? "Configured" : "Missing env"],
    ["Spotify env", Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI), "Optional integration"],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Health</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Operational status without exposing secrets.
        </p>
      </div>

      <div className="divide-y divide-neutral-800 border-y border-neutral-800">
        {rows.map(([label, ok, detail]) => (
          <div key={label} className="grid gap-3 py-3 md:grid-cols-[180px_120px_1fr]">
            <div className="font-medium">{label}</div>
            <div className={status(ok)}>{ok ? "OK" : "Needs setup"}</div>
            <div className="text-sm text-neutral-400">{detail}</div>
          </div>
        ))}
      </div>

      {data ? (
        <section className="grid gap-4 md:grid-cols-4">
          <div className="border border-neutral-800 p-4">
            <div className="text-xs uppercase text-neutral-500">Last message</div>
            <div className="mt-2 text-sm">{data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}</div>
          </div>
          <div className="border border-neutral-800 p-4">
            <div className="text-xs uppercase text-neutral-500">Pending reminders</div>
            <div className="mt-2 text-2xl">{data.pendingReminders}</div>
          </div>
          <div className="border border-neutral-800 p-4">
            <div className="text-xs uppercase text-neutral-500">Pending confirmations</div>
            <div className="mt-2 text-2xl">{data.pendingConfirmations}</div>
          </div>
          <div className="border border-neutral-800 p-4">
            <div className="text-xs uppercase text-neutral-500">Feature queue</div>
            <div className="mt-2 text-sm text-neutral-300">
              {Object.entries(data.queueCounts).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Empty"}
            </div>
          </div>
          <div className="border border-neutral-800 p-4 md:col-span-4">
            <div className="text-xs uppercase text-neutral-500">Latest tool signal</div>
            <div className="mt-2 text-sm text-neutral-300">
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
