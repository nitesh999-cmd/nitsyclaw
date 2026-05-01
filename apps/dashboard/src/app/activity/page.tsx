import { getDb, auditLog, messages, reminders, confirmations, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function loadActivity() {
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
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Activity</h2>
        <p className="mt-2 text-sm text-neutral-400">What NitsyClaw has seen, done, and attempted recently.</p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {data ? (
        <>
          <section>
            <h3 className="mb-2 text-sm uppercase tracking-wide text-neutral-400">Tool calls</h3>
            <div className="divide-y divide-neutral-800 border-y border-neutral-800">
              {data.audits.map((row) => (
                <div key={row.id} className="grid gap-3 py-3 md:grid-cols-[180px_100px_1fr_160px]">
                  <div className="text-sm">{row.tool}</div>
                  <div className={row.success ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
                    {row.success ? "success" : "failed"}
                  </div>
                  <div className="text-xs text-neutral-500">{row.error ?? JSON.stringify(row.output ?? {}).slice(0, 160)}</div>
                  <div className="text-xs text-neutral-500">{new Date(row.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="border border-neutral-800 p-4 text-sm">Messages: {data.recentMessages.length}</div>
            <div className="border border-neutral-800 p-4 text-sm">Reminders: {data.recentReminders.length}</div>
            <div className="border border-neutral-800 p-4 text-sm">Confirmations: {data.recentConfirmations.length}</div>
            <div className="border border-neutral-800 p-4 text-sm">Expenses: {data.recentExpenses.length}</div>
          </section>
        </>
      ) : null}
    </div>
  );
}
