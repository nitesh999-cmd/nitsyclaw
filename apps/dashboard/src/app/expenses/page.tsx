import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, insertExpense, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";
import {
  type ExpenseSearchParams,
  expenseWhere,
  normalizeExpenseFilters,
  one,
} from "../../lib/expense-utils.js";
import { logDashboardLoadError } from "../../lib/dashboard-runtime";

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
  if (!Number.isFinite(amount) || amount <= 0) redirect("/expenses?error=invalid-amount");
  if (!/^[A-Z]{3}$/.test(currency)) redirect("/expenses?error=invalid-currency");

  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) redirect("/expenses?error=invalid-date");
  const amountCents = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) redirect("/expenses?error=invalid-amount");

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
  const errorCode = one(filters.error);
  const addError = errorCode === "invalid-amount"
    ? "Amount must be a positive number (e.g. 18.50)."
    : errorCode === "invalid-currency"
    ? "Currency must be a 3-letter code (e.g. AUD, USD)."
    : errorCode === "invalid-date"
    ? "Date not recognised. Leave blank for now, or use the date picker."
    : null;
  const normalizedFilters = normalizeExpenseFilters(filters);
  let rows: Awaited<ReturnType<typeof load>> = [];
  let errorMsg: string | null = null;
  try {
    rows = await load(filters);
  } catch (e: unknown) {
    logDashboardLoadError("expenses", e);
    errorMsg = "Could not load expenses. Try again shortly.";
  }

  if (errorMsg) {
    return (
      <div className="nc-page">
        <section className="nc-hero">
          <div className="nc-eyebrow">Spend tracking</div>
          <h2 className="mt-2 text-3xl font-semibold">Expenses</h2>
        </section>
        <div className="border border-red-900 bg-red-950/40 p-4 text-sm">
          <p className="font-medium text-red-300">Could not load expenses</p>
          <p className="text-xs text-red-400 mt-2">{errorMsg}</p>
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
    <div className="nc-page">
      <section className="nc-hero">
        <div className="nc-eyebrow">Spend tracking</div>
        <h2 className="mt-2 text-3xl font-semibold">Expenses</h2>
        <p className="mt-3 text-sm text-slate-400" data-testid="expenses-total">
          {rows.length} expenses — total {displayCurrency} {(total / 100).toFixed(2)}
        </p>
      </section>

      {addError ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {addError}
        </div>
      ) : null}

      <section className="nc-section">
        <h3 className="nc-eyebrow mb-3">Log expense</h3>
        <form action={addExpense} className="grid gap-3 border border-slate-800 p-4 md:grid-cols-[120px_100px_160px_1fr_180px_auto]">
          <input name="amount" required placeholder="18.50" className="nc-input" />
          <input name="currency" placeholder="AUD" defaultValue="AUD" className="nc-input" />
          <input name="category" placeholder="coffee" className="nc-input" />
          <input name="merchant" placeholder="Merchant" className="nc-input" />
          <input name="occurredAt" type="datetime-local" className="nc-input" />
          <button className="nc-button">Add</button>
          <input name="notes" placeholder="Notes" className="nc-input md:col-span-6" />
        </form>
      </section>

      <section className="nc-section">
        <h3 className="nc-eyebrow mb-3">Filter</h3>
        <form className="grid gap-3 border border-slate-800 p-4 md:grid-cols-[1fr_160px_160px_160px_auto_auto]">
          <input name="q" defaultValue={normalizedFilters.q ?? ""} placeholder="Merchant search" className="nc-input" />
          <input name="category" defaultValue={normalizedFilters.category ?? ""} placeholder="Category" className="nc-input" />
          <input name="from" defaultValue={normalizedFilters.from ?? ""} type="date" className="nc-input" />
          <input name="to" defaultValue={normalizedFilters.to ?? ""} type="date" className="nc-input" />
          <button className="nc-button">Filter</button>
          <a href={asCsvUrl(filters)} className="nc-button text-center">CSV</a>
        </form>
      </section>

      {Object.keys(categoryTotals).length ? (
        <section className="nc-section grid gap-3 md:grid-cols-4">
          {Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([category, amount]) => (
              <div key={category} className="nc-tile">
                <div className="nc-eyebrow">{category}</div>
                <div className="mt-2 text-lg font-semibold text-slate-100">{displayCurrency} {(amount / 100).toFixed(2)}</div>
              </div>
            ))}
        </section>
      ) : null}

      {rows.length === 0 ? (
        <section className="nc-section">
          <p className="nc-muted">No expenses logged. Add one above or send a receipt photo on WhatsApp.</p>
        </section>
      ) : (
        <section className="nc-section">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4">Date</th>
                <th className="pr-4">Merchant</th>
                <th className="pr-4">Category</th>
                <th className="pr-4">Notes</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-900">
                  <td className="py-2 pr-4 whitespace-nowrap text-slate-300">
                    {new Date(row.occurredAt).toLocaleDateString()}
                  </td>
                  <td className="pr-4 text-slate-100">{row.merchant ?? "-"}</td>
                  <td className="pr-4 text-xs">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded">{row.category}</span>
                  </td>
                  <td className="pr-4 text-xs text-slate-500">{row.notes ?? ""}</td>
                  <td className="text-right whitespace-nowrap text-slate-100">
                    {row.currency} {(row.amount / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
