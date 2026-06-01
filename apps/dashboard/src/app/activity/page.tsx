import { getDb, auditLog, messages, reminders, confirmations, expenses } from "@nitsyclaw/shared/db";
import { redactAuditString, sanitizeAuditPayload } from "@nitsyclaw/shared/db";
import { assertPublicSaleTenantBoundaries } from "@nitsyclaw/shared/tenancy";
import { relativeTime } from "@nitsyclaw/shared/utils";
import { desc } from "drizzle-orm";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";

export const dynamic = "force-dynamic";

async function loadActivity() {
  assertPublicSaleTenantBoundaries();
  const db = getDb();
  const [audits, recentMessages, recentReminders, recentConfirmations, recentExpenses] = await Promise.all([
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(30),
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(20),
    db.select().from(reminders).orderBy(desc(reminders.createdAt)).limit(10),
    db.select().from(confirmations).orderBy(desc(confirmations.createdAt)).limit(10),
    db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(10),
  ]);
  return { audits, recentMessages, recentReminders, recentConfirmations, recentExpenses };
}

export default async function ActivityPage() {
  let data: Awaited<ReturnType<typeof loadActivity>> | null = null;
  let error: string | null = null;
  try {
    data = await loadActivity();
  } catch (e) {
    logDashboardLoadError("activity", e);
    error = "Could not load recent activity. Try again shortly.";
  }

  return (
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Recent system trace</div>
        <h2 className="mt-2 text-3xl font-semibold">Activity</h2>
        <p className="mt-3 text-sm text-slate-400">What NitsyClaw has seen, done, and attempted recently.</p>
      </section>

      {error ? (
        <div className="border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="nc-section">
            <h3 className="nc-eyebrow mb-3">Tool calls</h3>
            <div className="divide-y divide-slate-800 border-y border-slate-800">
              {data.audits.map((row) => (
                <div key={row.id} className="grid gap-3 py-3 md:grid-cols-[180px_100px_1fr_160px]">
                  <div className="text-sm">{row.tool}</div>
                  <div className={row.success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
                    {row.success ? "success" : "failed"}
                  </div>
                  <div className="text-xs text-slate-500">{safeAuditSignal(row.error, row.output as Record<string, unknown> | null)}</div>
                  <div className="text-xs text-slate-500" title={new Date(row.createdAt).toLocaleString()}>
                    {relativeTime(new Date(row.createdAt))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <a href="/conversations" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
              <div className="nc-eyebrow mb-2">Messages</div>
              <div className="text-2xl font-semibold text-slate-100">{data.recentMessages.length}</div>
              <div className="mt-1 text-xs text-slate-500">recent</div>
            </a>
            <a href="/reminders" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
              <div className="nc-eyebrow mb-2">Reminders</div>
              <div className="text-2xl font-semibold text-slate-100">{data.recentReminders.length}</div>
              <div className="mt-1 text-xs text-slate-500">recent</div>
            </a>
            <a href="/confirmations" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
              <div className="nc-eyebrow mb-2">Confirmations</div>
              <div className="text-2xl font-semibold text-slate-100">{data.recentConfirmations.length}</div>
              <div className="mt-1 text-xs text-slate-500">recent</div>
            </a>
            <a href="/expenses" className="nc-tile hover:border-[#d8b75d]/40 transition-colors">
              <div className="nc-eyebrow mb-2">Expenses</div>
              <div className="text-2xl font-semibold text-slate-100">{data.recentExpenses.length}</div>
              <div className="mt-1 text-xs text-slate-500">recent</div>
            </a>
          </section>
        </>
      ) : null}
    </div>
  );
}

function safeAuditSignal(error: string | null, output: Record<string, unknown> | null): string {
  if (error) return redactAuditString(error);
  return JSON.stringify(sanitizeAuditPayload(output)).slice(0, 160);
}
