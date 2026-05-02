export interface ExpenseFilters {
  q?: string;
  category?: string;
  from?: string;
  to?: string;
}

export type ExpenseSearchParams = Record<string, string | string[] | undefined>;

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeExpenseFilters(params: ExpenseSearchParams = {}): ExpenseFilters {
  return {
    q: one(params.q)?.trim() || undefined,
    category: one(params.category)?.trim() || undefined,
    from: one(params.from)?.trim() || undefined,
    to: one(params.to)?.trim() || undefined,
  };
}

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

export function validateExpenseFilters(filters: ExpenseFilters): string | null {
  if (filters.from && !parseDate(filters.from)) return "Invalid from date";
  if (filters.to && !parseDate(filters.to)) return "Invalid to date";
  return null;
}

export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const dangerous = /^[\u0000-\u0020\uFEFF]*[=+\-@]/u.test(raw);
  const safe = dangerous ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
