// Today view — calendar, top reminders, quick stats.
import { getDb } from "@nitsyclaw/shared/db";
import { reminders, expenses, briefs, confirmations, messages } from "@nitsyclaw/shared/db";
import { assertPublicSaleTenantBoundaries } from "@nitsyclaw/shared/tenancy";
import { eq, gte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const DEFAULT_TODAY_TIMEOUT_MS = 1_200;

async function loadToday() {
  assertPublicSaleTenantBoundaries();
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [pendingReminders, recentExpenses, latestBrief, pendingConfirmations, lastMessageRows] = await Promise.all([
    db.select().from(reminders).where(eq(reminders.status, "pending")).orderBy(reminders.fireAt).limit(10),
    db.select().from(expenses).where(gte(expenses.occurredAt, today)).orderBy(desc(expenses.occurredAt)).limit(10),
    db.select().from(briefs).orderBy(desc(briefs.createdAt)).limit(1),
    db.select().from(confirmations).where(eq(confirmations.status, "pending")).limit(10),
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(1),
  ]);
  return {
    pendingReminders,
    recentExpenses,
    latestBrief: latestBrief[0] ?? null,
    pendingConfirmations,
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
  } catch (error) {
    console.error("[dashboard] today data unavailable; rendering safe demo shell", {
      error: error instanceof Error ? error.message : "unknown",
    });
    data = { ...emptyTodayData(), dataUnavailable: true };
  }
  const topReminder = data.pendingReminders[0] ?? null;
  const attentionCount = data.pendingConfirmations.length + data.pendingReminders.length;
  const todayTotal = data.recentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const overdue = data.pendingReminders.filter((r) => r.fireAt < new Date());
  const bestNextAction = data.pendingConfirmations.length > 0
    ? { href: "/confirmations", label: "Review waiting approvals", detail: "Something needs your decision before it can act." }
    : overdue.length > 0
      ? { href: "/reminders", label: "Clear overdue reminders", detail: "Handle the things that have slipped." }
      : data.recentExpenses.length === 0
        ? { href: "/expenses", label: "Log first expense", detail: "Prove receipt and spending capture before adding more integrations." }
        : { href: "/chat", label: "Summarise a bill", detail: "Paste a bill or receipt and turn the due date into a reminder." };
  const nowWorks = [
    "WhatsApp questions and voice notes",
    "Reminders, memory, AUD expenses",
    "Bill/doc summaries and safe drafts",
  ];
  const needsSetup = [
    "Email, Drive, Photos, Spotify",
    "Phone/SMS and bank feeds",
    "Private provider actions",
  ];
  const mobileActions = [
    { href: "/chat", label: "Ask", detail: "Talk or type", tone: "primary" },
    { href: "/confirmations", label: "Review", detail: `${data.pendingConfirmations.length} waiting`, tone: "warn" },
    { href: "/reminders", label: "Reminders", detail: `${data.pendingReminders.length} saved`, tone: overdue.length > 0 ? "danger" : "normal" },
    { href: "/expenses", label: "Spending", detail: `${data.recentExpenses.length} today`, tone: "normal" },
    { href: "/chat", label: "Bills", detail: "Summarise due dates", tone: "normal" },
    { href: "/privacy-center", label: "Privacy", detail: "What is safe", tone: "normal" },
  ];

  return (
    <div className="nc-page">
      <section className="nc-hero overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="nc-eyebrow">WhatsApp life-admin command centre</div>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              {greeting}. Life admin, sorted.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 md:text-base">
              Ask once. Save the important parts. Review risky actions before anything important changes.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row" data-testid="today-primary-actions">
              <a href="/chat" className="nc-button-primary">Ask for help</a>
              <a href={bestNextAction.href} className="nc-button">{bestNextAction.label}</a>
            </div>
            <div className="mt-5 grid gap-2 text-xs text-stone-600 sm:grid-cols-3" data-testid="today-trust-strip">
              <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] px-3 py-2">
                <span className="font-semibold text-stone-950">Private first</span>
                <span className="block">Owner-gated dashboard</span>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] px-3 py-2">
                <span className="font-semibold text-stone-950">Asks before risk</span>
                <span className="block">Approvals stay visible</span>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#fbf8f2] px-3 py-2">
                <span className="font-semibold text-stone-950">WhatsApp ready</span>
                <span className="block">Use plain language</span>
              </div>
            </div>
          </div>

          <div className="nc-glass-panel p-4" data-testid="today-attention-panel">
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
            </div>
          </div>
        </div>
      </section>

      {data.dataUnavailable ? (
        <div className="rounded-xl border border-amber-900 bg-amber-950/30 p-4 text-sm leading-6 text-amber-200" role="status">
          Live dashboard data is taking too long to load. I am showing a safe temporary view instead of pretending the day is empty.
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]" data-testid="today-work-status">
        <div className="nc-section">
          <div className="nc-eyebrow">Validation demo</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">Use these today</h2>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            {nowWorks.map((item) => (
              <div key={item} className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="nc-section">
          <div className="nc-eyebrow">Not live in demo</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">Do not fake these</h2>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            {needsSetup.map((item) => (
              <div key={item} className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2">
                {item}
              </div>
            ))}
          </div>
          <a href="/integrations" className="mt-4 inline-flex text-sm font-semibold text-[#d8b75d] hover:text-[#f1d58a]">
            See connection status
          </a>
        </div>

        <div className="nc-section">
          <div className="nc-eyebrow">Best next action</div>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">{bestNextAction.label}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{bestNextAction.detail}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a href={bestNextAction.href} className="nc-button-primary">Do this next</a>
            <a href="/privacy-center" className="nc-button">Check safety</a>
          </div>
        </div>
      </section>

      <section className="nc-mobile-action-grid lg:hidden" data-testid="mobile-dashboard-actions" aria-label="Mobile dashboard actions">
        {mobileActions.map((action) => (
          <a
            key={`${action.href}-${action.label}`}
            href={action.href}
            className={`nc-mobile-action ${action.tone === "primary" ? "nc-mobile-action-primary" : ""} ${action.tone === "danger" ? "nc-mobile-action-danger" : ""} ${action.tone === "warn" ? "nc-mobile-action-warn" : ""}`}
          >
            <span className="text-sm font-semibold">{action.label}</span>
            <span className="mt-0.5 block text-[11px] leading-4 opacity-80">{action.detail}</span>
          </a>
        ))}
      </section>

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
        <a href="/chat" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
          <div className="nc-eyebrow">Bills</div>
          <div className="mt-3 text-xl font-semibold text-slate-100">Summarise</div>
          <div className="mt-2 text-xs text-slate-500">Paste bill text or receipt details</div>
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

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]" data-testid="today-quick-start">
        <div className="nc-section">
          <div className="nc-eyebrow">Start here</div>
          <h2 className="mt-2 text-2xl font-semibold">Say what you need done.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use the same words you would send in WhatsApp. NitsyClaw turns useful requests into reminders, saved notes,
            drafts, decisions, or build requests.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a href="/chat" className="nc-button-primary">Open Ask</a>
            <a href="/help" className="nc-button">See examples</a>
          </div>
        </div>
        <div className="nc-section">
          <div className="nc-eyebrow">Try saying</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[
            "Bill summary: AGL bill $240 due 18 May",
            "Remind me to pay that bill the day before it is due",
            "I spent $18.40 at Chemist Warehouse for medicine",
            "Check before send: I am unhappy about this bill",
            ].map((example) => (
              <div key={example} className="rounded-xl border border-stone-200 bg-[#fbf8f2] p-3 text-sm leading-6 text-stone-700">
                {example}
              </div>
            ))}
          </div>
        </div>
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
            <a href="/expenses" className="nc-button">Spending</a>
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
