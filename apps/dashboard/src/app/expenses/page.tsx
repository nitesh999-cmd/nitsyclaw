import { revalidatePath } from "next/cache";
import { getDb, insertExpense, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";
import {
  type ExpenseSearchParams,
  expenseWhere,
  normalizeExpenseFilters,
} from "../../lib/expense-utils.js";

export const dynamic = "force-dynamic";

async function addExpense(formData: FormData) {
  "use server";
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currency = String(formData.get("currency") ?? "AUD").trim().toUpperCase() || "AUD";
  const category = String(formData.get("category") ?? "general").trim() || "general";
  const merchant = String(formData.get("merchant") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (!/^[A-Z]{3}$/.test(currency)) return;

  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return;
  const amountCents = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) return;

  await insertExpense(getDb(), {
    amount: amountCents,
    currency,
    category,
    merchant: merchant || null,
    occurredAt,
    notes: notes || null,
  });
  revalidatePath("/expenses");
  revalidatePath("/");
}

async function load(filters: ExpenseSearchParams) {
  const db = getDb();
  const where = expenseWhere(normalizeExpenseFilters(filters));

  if (where) {
    return db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.occurredAt))
      .limit(250);
  }

  return db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(250);
}

function asCsvUrl(filters: ExpenseSearchParams) {
  const normalized = normalizeExpenseFilters(filters);
  const params = new URLSearchParams();
  if (normalized.q) params.set("q", normalized.q);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.from) params.set("from", normalized.from);
  if (normalized.to) params.set("to", normalized.to);
  const qs = params.toString();
  return qs ? `/api/expenses/export?${qs}` : "/api/expenses/export";
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: Promise<ExpenseSearchParams>;
}) {
  const filters = searchParams ? await searchParams : {};
  const normalizedFilters = normalizeExpenseFilters(filters);
  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load(filters);
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

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const categoryTotals = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + row.amount;
    return acc;
  }, {});
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));
  const displayCurrency = currencies.length === 1 ? currencies[0] : "mixed";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Expenses</h2>
        <p className="mt-2 text-xs text-neutral-500" data-testid="expenses-total">
          {rows.length} expenses - total {displayCurrency} {(total / 100).toFixed(2)}
        </p>
      </div>

      <form action={addExpense} className="grid gap-3 border border-neutral-800 p-4 md:grid-cols-[120px_100px_160px_1fr_180px_auto]">
        <input name="amount" required placeholder="18.50" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="currency" placeholder="AUD" defaultValue="AUD" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="category" placeholder="coffee" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="merchant" placeholder="Merchant" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="occurredAt" type="datetime-local" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <button className="border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500">Add</button>
        <input name="notes" placeholder="Notes" className="md:col-span-6 border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
      </form>

      <form className="grid gap-3 border border-neutral-800 p-4 md:grid-cols-[1fr_160px_160px_160px_auto_auto]">
        <input name="q" defaultValue={normalizedFilters.q ?? ""} placeholder="Merchant search" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="category" defaultValue={normalizedFilters.category ?? ""} placeholder="Category" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="from" defaultValue={normalizedFilters.from ?? ""} type="date" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <input name="to" defaultValue={normalizedFilters.to ?? ""} type="date" className="border border-neutral-800 bg-transparent px-3 py-2 text-sm" />
        <button className="border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500">Filter</button>
        <a href={asCsvUrl(filters)} className="border border-neutral-700 px-4 py-2 text-center text-sm hover:border-neutral-500">
          CSV
        </a>
      </form>

      {Object.keys(categoryTotals).length ? (
        <section className="grid gap-3 md:grid-cols-4">
          {Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([category, amount]) => (
              <div key={category} className="border border-neutral-800 p-3">
                <div className="text-xs uppercase text-neutral-500">{category}</div>
                <div className="mt-1 text-sm">{displayCurrency} {(amount / 100).toFixed(2)}</div>
              </div>
            ))}
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No expenses logged. Add one above or send a receipt photo on WhatsApp.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400 border-b border-neutral-800">
              <th className="py-2 pr-4">Date</th>
              <th className="pr-4">Merchant</th>
              <th className="pr-4">Category</th>
              <th className="pr-4">Notes</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-neutral-900">
                <td className="py-2 pr-4 whitespace-nowrap text-neutral-300">
                  {new Date(row.occurredAt).toLocaleDateString()}
                </td>
                <td className="pr-4 text-neutral-100">{row.merchant ?? "-"}</td>
                <td className="pr-4 text-xs">
                  <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">{row.category}</span>
                </td>
                <td className="pr-4 text-xs text-neutral-500">{row.notes ?? ""}</td>
                <td className="text-right whitespace-nowrap text-neutral-100">
                  {row.currency} {(row.amount / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
