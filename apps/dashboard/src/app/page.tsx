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
          <p className="mt-3 nc-muted">Database is not configured. Your home view is protected until storage is connected.</p>
        </section>
      </div>
    );
  }
  const pendingQueue = data.queueRows.filter((row) => row.status === "pending").length;
  const topReminder = data.pendingReminders[0] ?? null;
  const attentionCount = data.pendingConfirmations.length + data.pendingReminders.length + pendingQueue;
  return (
    <div className="nc-page">
      <section className="nc-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="nc-eyebrow">Today</h1>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              Life admin, finally in one place.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 md:text-base">
              A calm daily view for decisions, reminders, spending, and the little things that should not slip.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <a href="/chat" className="nc-button-primary">Ask for help</a>
              <a href="/reminders" className="nc-button">Check reminders</a>
            </div>
          </div>

          <div className="nc-panel-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nc-eyebrow">Needs attention</div>
                <div className="mt-2 text-5xl font-semibold text-stone-950">{attentionCount}</div>
              </div>
              <a href="/confirmations" className="nc-button min-h-9 px-3 text-xs">Review</a>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-stone-600">
              <div className="flex justify-between border-t border-stone-300/80 pt-2">
                <span>Approvals</span>
                <span className="font-semibold text-stone-950">{data.pendingConfirmations.length}</span>
              </div>
              <div className="flex justify-between border-t border-stone-300/80 pt-2">
                <span>Reminders</span>
                <span className="font-semibold text-stone-950">{data.pendingReminders.length}</span>
              </div>
              <div className="flex justify-between border-t border-stone-300/80 pt-2">
                <span>Requests</span>
                <span className="font-semibold text-stone-950">{pendingQueue}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <a href="/confirmations" className="nc-tile">
          <div className="nc-eyebrow">Approvals</div>
          <div className="mt-3 text-3xl font-semibold">{data.pendingConfirmations.length}</div>
          <div className="mt-2 text-xs text-stone-500">Need a decision</div>
        </a>
        <a href="/reminders" className="nc-tile">
          <div className="nc-eyebrow">Reminders</div>
          <div className="mt-3 text-3xl font-semibold">{data.pendingReminders.length}</div>
          <div className="mt-2 text-xs text-stone-500">Coming up</div>
        </a>
        <a href="/queue" className="nc-tile">
          <div className="nc-eyebrow">Requests</div>
          <div className="mt-3 text-3xl font-semibold">{pendingQueue}</div>
          <div className="mt-2 text-xs text-stone-500">Waiting to be built</div>
        </a>
        <a href="/activity" className="nc-tile">
          <div className="nc-eyebrow">Last activity</div>
          <div className="mt-3 text-sm text-stone-800">
            {data.lastMessage ? new Date(data.lastMessage.createdAt).toLocaleString() : "None"}
          </div>
          <div className="mt-2 text-xs text-stone-500">Latest message</div>
        </a>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="nc-section" data-testid="today-brief">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="nc-eyebrow">Latest brief</h3>
            <a href="/chat" className="text-xs font-semibold text-[#8e3f24] hover:text-stone-950">Refresh</a>
          </div>
          {data.latestBrief ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-stone-200 bg-[#fbf8f2] p-4 text-sm leading-6 text-stone-800">{data.latestBrief.body}</pre>
          ) : (
            <div className="nc-empty">
              <p>No brief yet.</p>
              <a href="/chat" className="mt-3 inline-flex text-sm font-semibold text-[#8e3f24] hover:text-stone-950">
                Create today&apos;s brief
              </a>
            </div>
          )}
        </div>

        <div className="nc-section">
          <h3 className="nc-eyebrow">Next up</h3>
          <div className="mt-3 rounded-xl border border-stone-200 bg-[#fbf8f2] p-4">
            <div className="text-sm font-semibold text-stone-950">
              {topReminder ? topReminder.text : "Nothing urgent scheduled"}
            </div>
            <div className="mt-2 text-xs text-stone-500">
              {topReminder ? new Date(topReminder.fireAt).toLocaleString() : "Use reminders when something must not slip."}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="/reminders" className="nc-button">Reminders</a>
            <a href="/queue" className="nc-button">Queue</a>
          </div>
        </div>
      </section>

      <section className="nc-section" data-testid="today-reminders">
        <h3 className="nc-eyebrow mb-3">Pending reminders</h3>
        {data.pendingReminders.length === 0 ? (
          <p className="nc-empty">Nothing scheduled. Add reminders from WhatsApp or Ask when something matters.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.pendingReminders.map((r) => (
              <li key={r.id} className="grid gap-1 border-b border-stone-200 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="font-medium text-stone-950">{r.text}</span>
                <span className="text-xs text-stone-500">{new Date(r.fireAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nc-section" data-testid="today-expenses">
        <h3 className="nc-eyebrow mb-3">Today&apos;s expenses</h3>
        {data.recentExpenses.length === 0 ? (
          <p className="nc-empty">Nothing logged today. Try: log $18.50 coffee at Starbucks.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.recentExpenses.map((e) => (
              <li key={e.id} className="grid gap-1 border-b border-stone-200 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span>
                  {e.merchant ?? "Unknown"} <span className="text-stone-500">({e.category})</span>
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
