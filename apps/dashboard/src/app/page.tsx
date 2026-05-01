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
      <div>
        <h2 className="text-2xl font-semibold mb-2">Today</h2>
        <p className="text-sm text-neutral-400">DB not configured. Set DATABASE_URL in .env.local.</p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Today</h2>

      <section className="grid gap-4 md:grid-cols-4">
        <a href="/confirmations" className="border border-neutral-800 p-4 hover:border-neutral-700">
          <div className="text-xs uppercase text-neutral-500">Pending approvals</div>
          <div className="mt-2 text-2xl">{data.pendingConfirmations.length}</div>
        </a>
        <a href="/reminders" className="border border-neutral-800 p-4 hover:border-neutral-700">
          <div className="text-xs uppercase text-neutral-500">Pending reminders</div>
          <div className="mt-2 text-2xl">{data.pendingReminders.length}</div>
        </a>
        <a href="/queue" className="border border-neutral-800 p-4 hover:border-neutral-700">
          <div className="text-xs uppercase text-neutral-500">Feature queue</div>
          <div className="mt-2 text-2xl">{data.queueRows.filter((row) => row.status === "pending").length}</div>
        </a>
        <a href="/activity" className="border border-neutral-800 p-4 hover:border-neutral-700">
          <div className="text-xs uppercase text-neutral-500">Last activity</div>
          <div className="mt-2 text-sm text-neutral-300">
            {data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}
          </div>
        </a>
      </section>

      <section data-testid="today-brief">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Latest brief</h3>
        {data.latestBrief ? (
          <pre className="whitespace-pre-wrap text-sm bg-neutral-900 p-4 rounded">{data.latestBrief.body}</pre>
        ) : (
          <p className="text-sm text-neutral-500">No brief yet. Try in chat: send my morning brief now.</p>
        )}
      </section>

      <section data-testid="today-reminders">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Pending reminders</h3>
        {data.pendingReminders.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing scheduled. Try: remind me to call Sam tomorrow at 9am.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.pendingReminders.map((r) => (
              <li key={r.id} className="flex justify-between border-b border-neutral-800 py-1">
                <span>{r.text}</span>
                <span className="text-neutral-500">{new Date(r.fireAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="today-expenses">
        <h3 className="text-sm uppercase tracking-wide text-neutral-400 mb-2">Today's expenses</h3>
        {data.recentExpenses.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing logged. Try: log $18.50 coffee at Starbucks.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.recentExpenses.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-neutral-800 py-1">
                <span>
                  {e.merchant ?? "—"} <span className="text-neutral-500">({e.category})</span>
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
