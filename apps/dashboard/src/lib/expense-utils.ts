import { and, eq, gte, ilike, lt } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { expenses } from "@nitsyclaw/shared/db";
import type { ExpenseFilters } from "./expense-pure.js";
export {
  csvCell,
  normalizeExpenseFilters,
  validateExpenseFilters,
  type ExpenseFilters,
  type ExpenseSearchParams,
} from "./expense-pure.js";

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(value);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? parsed
      : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function expenseWhere(filters: ExpenseFilters): SQL | undefined {
  const clauses: SQL[] = [];
  const from = parseDate(filters.from);
  const to = parseDate(filters.to);

  if (filters.category) clauses.push(eq(expenses.category, filters.category));
  if (filters.q) clauses.push(ilike(expenses.merchant, `%${filters.q}%`));
  if (from) clauses.push(gte(expenses.occurredAt, from));
  if (to) {
    const exclusiveTo = new Date(to);
    exclusiveTo.setDate(exclusiveTo.getDate() + 1);
    clauses.push(lt(expenses.occurredAt, exclusiveTo));
  }

  return clauses.length ? and(...clauses) : undefined;
}
