import { NextResponse } from "next/server";
import { getDb, expenses } from "@nitsyclaw/shared/db";
import { desc } from "drizzle-orm";
import {
  csvCell,
  expenseWhere,
  normalizeExpenseFilters,
  validateExpenseFilters,
} from "../../../../lib/expense-utils.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filters = normalizeExpenseFilters({
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const validationError = validateExpenseFilters(filters);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const where = expenseWhere(filters);

  const db = getDb();
  const rows = where
    ? await db.select().from(expenses).where(where).orderBy(desc(expenses.occurredAt)).limit(1000)
    : await db.select().from(expenses).orderBy(desc(expenses.occurredAt)).limit(1000);

  const header = ["date", "merchant", "category", "currency", "amount", "notes"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) => [
      row.occurredAt.toISOString(),
      row.merchant ?? "",
      row.category,
      row.currency,
      (row.amount / 100).toFixed(2),
      row.notes ?? "",
    ].map(csvCell).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nitsyclaw-expenses.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
