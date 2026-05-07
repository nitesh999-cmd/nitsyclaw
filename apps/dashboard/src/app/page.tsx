// Today view — calendar, top reminders, quick stats.
import { getDb } from "@nitsyclaw/shared/db";
import { reminders, expenses, briefs, confirmations, featureRequests, messages } from "@nitsyclaw/shared/db";
import { eq, gte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const DEFAULT_TODAY_TIMEOUT_MS = 1_200;

async function loadToday() {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [pendingReminders, recentExpenses, latestBrief, pendingConfirmations, queueRows, lastMessageRows] = await Promise.all([
    db.select().from(reminders).where(eq(reminders.status, "pending")).orderBy(reminders.fireAt).limit(10),
    db.select().from(expenses).where(gte(expenses.occurredAt, today)).orderBy(desc(expenses.occurredAt)).limit(10),
    db.select().from(briefs).orderBy(desc(briefs.createdAt)).limit(1),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(10),
    db.select().from(featureRequests).where(eq(featureRequests.status, "pending")).limit(50),
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

type TodayData = Awaited<ReturnType<typeof loadToday>>;
type TodayState = TodayData & { dataUnavailable: boolean };

async function loadTodayWithTimeout(): Promise<TodayState> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutMs = todayTimeoutMs();
  const fallback = new Promise<TodayState>((resolve) => {
    timeout = setTimeout(() => {
      console.error("[dashboard] today data load timed out; rendering safe empty state", { timeoutMs });
      resolve({ ...emptyTodayData(), dataUnavailable: true });
    }, timeoutMs);
  });

  try {
    const loaded = loadToday().then((data) => ({ ...data, dataUnavailable: false }));
    return await Promise.race([loaded, fallback]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function emptyTodayData(): TodayData {
  return {
    pendingReminders: [],
    recentExpenses: [],
    latestBrief: null,
    pendingConfirmations: [],
    queueRows: [],
    lastMessage: null,
  };
}

function todayTimeoutMs(): number {
  const parsed = Number(process.env.NITSYCLAW_TODAY_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 8_000) return parsed;
  return DEFAULT_TODAY_TIMEOUT_MS;
}

function timeGreeting(): string {
  const tz = process.env.TIMEZONE ?? "UTC";
  const hour = Number(new Date().toLocaleString("en-AU", { timeZone: tz, hour: "numeric", hour12: false }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const greeting = timeGreeting();
  let data: TodayState;
  try {
    data = await loadTodayWithTimeout();
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
  const todayTotal = data.recentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const overdue = data.pendingReminders.filter((r) => r.fireAt < new Date());

  return (
    <div className="nc-page">
      <section className="nc-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="nc-eyebrow">Today</h1>
            <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              {greeting}. Life admin, sorted.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
              A calm daily view for decisions, reminders, spending, and the little things that should not slip.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <a href="/chat" className="nc-button-primary">Ask for help</a>
              <a href="/reminders" className="nc-button">Check reminders</a>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="nc-eyebrow">Needs attention</div>
                <div className="mt-2 text-5xl font-semibold text-slate-100">{attentionCount}</div>
              </div>
              <a href="/confirmations" className="nc-button min-h-9 px-3 text-xs">Review</a>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-slate-400">
              <div className="flex justify-between border-t border-slate-700/80 pt-2">
                <span>Approvals</span>
                <span className="font-semibold text-slate-100">{data.pendingConfirmations.length}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/80 pt-2">
                <span>Reminders{overdue.length > 0 && <span className="ml-1 text-red-400">({overdue.length} overdue)</span>}</span>
                <span className="font-semibold text-slate-100">{data.pendingReminders.length}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700/80 pt-2">
                <span>Requests</span>
                <span className="font-semibold text-slate-100">{pendingQueue}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {data.dataUnavailable ? (
        <div className="rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm leading-6 text-amber-200" role="status">
          Live dashboard data is taking too long to load. I am showing a safe temporary view instead of pretending the day is empty.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <a href="/confirmations" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
          <div className="nc-eyebrow">Approvals</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{data.pendingConfirmations.length}</div>
          <div className="mt-2 text-xs text-slate-500">Need a decision</div>
        </a>
        <a href="/reminders" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
          <div className="nc-eyebrow">Reminders</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{data.pendingReminders.length}</div>
          <div className={`mt-2 text-xs ${overdue.length > 0 ? "text-red-400" : "text-slate-500"}`}>
            {overdue.length > 0 ? `${overdue.length} overdue` : "Coming up"}
          </div>
        </a>
        <a href="/queue" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
          <div className="nc-eyebrow">Requests</div>
          <div className="mt-3 text-3xl font-semibold text-slate-100">{pendingQueue}</div>
          <div className="mt-2 text-xs text-slate-500">Waiting to be built</div>
        </a>
        <a href="/expenses" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
          <div className="nc-eyebrow">Today&apos;s spend</div>
          <div className="mt-3 text-xl font-semibold text-slate-100">
            {data.recentExpenses.length > 0 ? `AUD ${(todayTotal / 100).toFixed(2)}` : "—"}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {data.recentExpenses.length > 0 ? `${data.recentExpenses.length} items` : "Nothing logged"}
          </div>
        </a>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="nc-section" data-testid="today-brief">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="nc-eyebrow">Latest brief</h3>
            <a href="/chat" className="text-xs font-semibold text-[#d8b75d] hover:text-[#f1d58a]">Refresh</a>
          </div>
          {data.latestBrief ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm leading-6 text-slate-300">{data.latestBrief.body}</pre>
          ) : (
            <div className="nc-empty">
              <p>No brief yet.</p>
              <a href="/chat" className="mt-3 inline-flex text-sm font-semibold text-[#d8b75d] hover:text-[#f1d58a]">
                Create today&apos;s brief
              </a>
            </div>
          )}
        </div>

        <div className="nc-section">
          <h3 className="nc-eyebrow">Next up</h3>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className={`text-sm font-semibold ${topReminder && topReminder.fireAt < new Date() ? "text-red-300" : "text-slate-100"}`}>
              {topReminder ? topReminder.text : "Nothing urgent scheduled"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
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
            {data.pendingReminders.map((r) => {
              const isOverdue = r.fireAt < new Date();
              return (
                <li key={r.id} className="grid gap-1 border-b border-slate-800 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <span className={`font-medium ${isOverdue ? "text-red-300" : "text-slate-200"}`}>{r.text}</span>
                  <span className={`text-xs ${isOverdue ? "text-red-400" : "text-slate-500"}`}>
                    {isOverdue ? "Overdue · " : ""}{new Date(r.fireAt).toLocaleString()}
                  </span>
                </li>
              );
            })}
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
              <li key={e.id} className="grid gap-1 border-b border-slate-800 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="text-slate-200">
                  {e.merchant ?? "Unknown"} <span className="text-slate-500">({e.category})</span>
                </span>
                <span className="font-medium text-slate-100">
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
