import { getDb, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  let rows: Awaited<ReturnType<typeof load>> = [];
  try { rows = await load(); } catch { return <p className="text-sm text-neutral-500">DB not configured.</p>; }
  const total = rows.reduce((sum, e) => sum + e.amount, 0);
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Expenses</h2>
      <p className="mb-4 text-sm text-neutral-400" data-testid="expenses-total">Total (last 100): {(total / 100).toFixed(2)}</p>
      <table className="w-full text-sm" data-testid="expenses-table">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-1">Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-neutral-800">
              <td className="py-1">{new Date(e.occurredAt).toLocaleDateString()}</td>
              <td>{e.merchant ?? "—"}</td>
              <td>{e.category}</td>
              <td className="text-right">{e.currency} {(e.amount / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function load() {
  const db = getDb();
  return db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(100);
}
