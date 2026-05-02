import { getDb, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load();
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  if (errorMsg) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Expenses</h2>
        <div className="p-4 bg-red-950/40 border border-red-900 rounded text-sm">
          <p className="font-medium text-red-300">Database error</p>
          <pre className="text-xs text-red-400 mt-2 whitespace-pre-wrap">{errorMsg}</pre>
        </div>
      </div>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Expenses</h2>
      <p className="text-xs text-neutral-500" data-testid="expenses-total">
        {rows.length} expenses · total {(total / 100).toFixed(2)}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No expenses logged.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400 border-b border-neutral-800">
              <th className="py-2 pr-4">Date</th>
              <th className="pr-4">Merchant</th>
              <th className="pr-4">Category</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-900">
                <td className="py-2 pr-4 whitespace-nowrap text-neutral-300">
                  {new Date(r.occurredAt).toLocaleDateString()}
                </td>
                <td className="pr-4 text-neutral-100">{r.merchant ?? "—"}</td>
                <td className="pr-4 text-xs">
                  <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">{r.category}</span>
                </td>
                <td className="text-right whitespace-nowrap text-neutral-100">
                  {r.currency} {(r.amount / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(100);
}
