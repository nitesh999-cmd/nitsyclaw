import { getDb, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try {
    rows = await load();
  } catch (e: any) {
    console.error("[Expenses] DB error:", e);
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Expenses</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm font-medium text-red-900">Database error</p>
          <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{e?.message ?? String(e)}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Expenses</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No expenses logged.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="p-3 bg-white border rounded">
              <div className="text-sm font-medium">${(r.amount / 100).toFixed(2)} - {r.category}</div>
              <div className="text-xs text-neutral-500 mt-1">{r.merchant ?? "—"}</div>
              <div className="text-xs text-neutral-400 mt-1">{new Date(r.occurredAt).toLocaleDateString()}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(100);
}