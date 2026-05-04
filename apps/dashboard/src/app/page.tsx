// Today view — calendar, top reminders, quick stats.
import { getDb } from "@nitsyclaw/shared/db";
import { reminders, expenses, briefs, confirmations, featureRequests, messages } from "@nitsyclaw/shared/db";
import { eq, gte, desc } from "drizzle-orm";

async function loadToday() {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [pendingReminders, recentExpenses, latestBrief, pendingConfirmations, queueRows, lastMessageRows] = await Promise.all([
    db.select().from(reminders).where(eq(reminders.status, "pending")).orderBy(reminders.fireAt).limit(10),
    db.select().from(expenses).where(gte(expenses.occurredAt, today)).orderBy(desc(expenses.occurredAt)).limit(10),
    db.select().from(briefs).orderBy(desc(briefs.createdAt)).limit(1),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(10),
    db.select().from(featureRequests).limit(100),
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
  ]);
  return {
    pendingReminders,
    recentExpenses,
    latestBrief: latestBrief[0] ?? null,
    pendingConfirmations,
    queueRows,
    lastMessage: lastMessageRows[0] ?? null,
  };
}

export default async function TodayPage() {
  let data: Awaited<ReturnType<typeof loadToday>>;
  try {
    data = await loadToday();
  } catch {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Today</div>
          <h2 className="mt-2 text-3xl font-semibold">Dashboard unavailable</h2>
          <p className="mt-3 nc-muted">Database is not configured. Set `DATABASE_URL` in `.env.local`.</p>
        </section>
      </div>
    );
  }
  const pendingQueue = data.queueRows.filter((row) => row.status === "pending").length;
  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="nc-eyebrow">Today</div>
            <h2 className="mt-2 text-3xl font-semibold md:text-4xl">Today</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Your day, handled in one place: approvals, reminders, queued builds, WhatsApp context, and the latest brief.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/chat" className="nc-button-primary">Ask NitsyClaw</a>
            <a href="/command" className="nc-button">Command</a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <a href="/confirmations" className="nc-tile">
          <div className="nc-eyebrow">Approvals</div>
          <div className="mt-3 text-3xl font-semibold">{data.pendingConfirmations.length}</div>
          <div className="mt-2 text-xs text-slate-500">Need a decision</div>
        </a>
        <a href="/reminders" className="nc-tile">
          <div className="nc-eyebrow">Reminders</div>
          <div className="mt-3 text-3xl font-semibold">{data.pendingReminders.length}</div>
          <div className="mt-2 text-xs text-slate-500">Waiting in queue</div>
        </a>
        <a href="/queue" className="nc-tile">
          <div className="nc-eyebrow">Build queue</div>
          <div className="mt-3 text-3xl font-semibold">{pendingQueue}</div>
          <div className="mt-2 text-xs text-slate-500">Pending product upgrades</div>
        </a>
        <a href="/activity" className="nc-tile">
          <div className="nc-eyebrow">Last activity</div>
          <div className="mt-3 text-sm text-slate-200">
            {data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}
          </div>
          <div className="mt-2 text-xs text-slate-500">Latest cross-surface message</div>
        </a>
      </section>

      <section className="nc-section" data-testid="today-brief">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="nc-eyebrow">Latest brief</h3>
          <a href="/chat" className="text-xs text-cyan-300 hover:text-cyan-200">Regenerate</a>
        </div>
        {data.latestBrief ? (
          <pre className="whitespace-pre-wrap border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-200">{data.latestBrief.body}</pre>
        ) : (
          <p className="nc-muted">No brief yet. Try in chat: send my morning brief now.</p>
        )}
      </section>

      <section className="nc-section" data-testid="today-reminders">
        <h3 className="nc-eyebrow mb-3">Pending reminders</h3>
        {data.pendingReminders.length === 0 ? (
          <p className="nc-muted">Nothing scheduled. Try: remind me to call Sam tomorrow at 9am.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.pendingReminders.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-b border-slate-800 py-2">
                <span>{r.text}</span>
                <span className="text-slate-500">{new Date(r.fireAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nc-section" data-testid="today-expenses">
        <h3 className="nc-eyebrow mb-3">Today&apos;s expenses</h3>
        {data.recentExpenses.length === 0 ? (
          <p className="nc-muted">Nothing logged. Try: log $18.50 coffee at Starbucks.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.recentExpenses.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 border-b border-slate-800 py-2">
                <span>
                  {e.merchant ?? "Unknown"} <span className="text-slate-500">({e.category})</span>
                </span>
                <span>
                  {e.currency} {(e.amount / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
