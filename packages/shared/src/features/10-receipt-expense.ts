// Feature 10: Receipt photo → expense logged + categorized.

import { z } from "zod";
import { insertExpense } from "../db/repo.js";
import { parseExpenseText } from "../utils/parse.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { ImageAnalyzer } from "../agent/deps.js";
import type { DB } from "../db/client.js";

type Category = "food" | "transport" | "groceries" | "shopping" | "bills" | "entertainment" | "health" | "other";

export interface ParsedCsvExpense {
  amountCents: number;
  currency: string;
  category: Category;
  merchant: string;
  occurredAt: Date;
  notes?: string;
}

export interface SkippedCsvExpense {
  row: number;
  reason: "empty" | "missing_amount" | "credit_or_income" | "missing_description" | "invalid_date";
}

export interface ExpenseCsvParseResult {
  items: ParsedCsvExpense[];
  skipped: SkippedCsvExpense[];
}

export interface ExpenseCsvImportResult extends ExpenseCsvParseResult {
  importedCount: number;
  totalAmountCents: number;
  currency: string;
}

/**
 * Lightweight categorizer over merchant + raw text. Cheap; LLM can override.
 */
export function categorizeExpense(input: { merchant?: string; rawText?: string }): Category {
  const blob = `${input.merchant ?? ""} ${input.rawText ?? ""}`.toLowerCase();
  if (/uber|ola|lyft|metro|petrol|fuel|gas station/.test(blob)) return "transport";
  if (/zomato|swiggy|dominos|cafe|restaurant|starbucks|coffee/.test(blob)) return "food";
  if (/big\s*basket|grocer|supermarket|reliance fresh|d-?mart/.test(blob)) return "groceries";
  if (/netflix|spotify|prime|cinema|cinemas|movie|theater/.test(blob)) return "entertainment";
  if (/pharmacy|hospital|clinic|chemist|apollo/.test(blob)) return "health";
  if (/electric|water|gas bill|jio|airtel|vodafone|broadband/.test(blob)) return "bills";
  if (/amazon|flipkart|myntra|nykaa|ajio/.test(blob)) return "shopping";
  return "other";
}

export async function processReceiptImage(args: {
  image: Buffer;
  mimetype: string;
  analyzer: ImageAnalyzer;
  db: DB;
  now: Date;
  sourceMessageId?: string;
}) {
  const fields = await args.analyzer.extractReceipt(args.image, args.mimetype);
  if (!fields.amount || fields.amount <= 0) throw new Error("could not extract amount from receipt");
  const category = categorizeExpense({ merchant: fields.merchant, rawText: fields.rawText });
  const e = await insertExpense(args.db, {
    amount: Math.round(fields.amount * 100),
    currency: fields.currency ?? "AUD",
    category,
    merchant: fields.merchant,
    occurredAt: fields.date ?? args.now,
    sourceMessageId: args.sourceMessageId,
  });
  return {
    id: e.id,
    amount: fields.amount,
    currency: e.currency,
    category,
    merchant: e.merchant,
    rawText: fields.rawText,
  };
}

export function parseExpenseCsv(args: {
  csv: string;
  now: Date;
  defaultCurrency?: string;
}): ExpenseCsvParseResult {
  const rows = parseCsvRows(args.csv).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return { items: [], skipped: [] };

  const headers = rows[0]!.map(normalizeHeader);
  const dateIndex = findHeader(headers, ["date", "transactiondate", "transdate", "posteddate"]);
  const descriptionIndex = findHeader(headers, ["description", "details", "merchant", "narration", "memo", "payee", "transaction"]);
  const amountIndex = findHeader(headers, ["amount", "value", "transactionamount"]);
  const debitIndex = findHeader(headers, ["debit", "withdrawal", "withdrawals", "out", "paidout"]);
  const creditIndex = findHeader(headers, ["credit", "deposit", "deposits", "in", "paidin"]);
  const currencyIndex = findHeader(headers, ["currency", "ccy"]);
  const items: ParsedCsvExpense[] = [];
  const skipped: SkippedCsvExpense[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    if (!row.some((cell) => cell.trim())) {
      skipped.push({ row: rowNumber, reason: "empty" });
      return;
    }

    const description = cell(row, descriptionIndex);
    if (!description) {
      skipped.push({ row: rowNumber, reason: "missing_description" });
      return;
    }

    const amount = getExpenseAmount(row, amountIndex, debitIndex, creditIndex);
    if (amount.reason) {
      skipped.push({ row: rowNumber, reason: amount.reason });
      return;
    }

    const occurredAt = parseCsvDate(cell(row, dateIndex), args.now);
    if (!occurredAt) {
      skipped.push({ row: rowNumber, reason: "invalid_date" });
      return;
    }

    const amountCents = Math.round(amount.value * 100);
    const currency = cell(row, currencyIndex) || args.defaultCurrency || "INR";
    items.push({
      amountCents,
      currency: currency.toUpperCase(),
      category: categorizeExpense({ merchant: description, rawText: row.join(" ") }),
      merchant: description,
      occurredAt,
      notes: `CSV row ${rowNumber}`,
    });
  });

  return { items, skipped };
}

export async function importExpensesFromCsv(args: {
  csv: string;
  db: DB;
  now: Date;
  defaultCurrency?: string;
  sourceMessageId?: string;
}): Promise<ExpenseCsvImportResult> {
  const parsed = parseExpenseCsv({
    csv: args.csv,
    now: args.now,
    defaultCurrency: args.defaultCurrency,
  });
  for (const item of parsed.items) {
    await insertExpense(args.db, {
      amount: item.amountCents,
      currency: item.currency,
      category: item.category,
      merchant: item.merchant,
      occurredAt: item.occurredAt,
      sourceMessageId: args.sourceMessageId,
      notes: item.notes,
    });
  }

  return {
    ...parsed,
    importedCount: parsed.items.length,
    totalAmountCents: parsed.items.reduce((sum, item) => sum + item.amountCents, 0),
    currency: parsed.items[0]?.currency ?? args.defaultCurrency ?? "INR",
  };
}

export function registerReceiptExpense(registry: ToolRegistry): void {
  registry.register({
    name: "log_expense_text",
    description:
      "Log an expense from a free-form text description like 'spent 200 on coffee at Starbucks'. Returns null if no amount is found.",
    inputSchema: z.object({
      text: z.string().min(2),
    }),
    handler: async (input: { text: string }, ctx: ToolContext) => {
      const parsed = parseExpenseText(input.text);
      if (!parsed) throw new Error("could not parse amount from text");
      const category = categorizeExpense({ merchant: parsed.merchant, rawText: input.text });
      const e = await insertExpense(ctx.deps.db, {
        amount: parsed.amountCents,
        currency: parsed.currency,
        category: parsed.category ?? category,
        merchant: parsed.merchant,
        occurredAt: ctx.now,
      });
      return {
        id: e.id,
        amountCents: e.amount,
        currency: e.currency,
        category: e.category,
        merchant: e.merchant,
      };
    },
  });

  registry.register({
    name: "import_expenses_csv",
    description:
      "Import expenses from a bank/card CSV export. This logs expense rows only and skips credits/income.",
    inputSchema: z.object({
      csv: z.string().min(10),
      defaultCurrency: z.string().min(3).max(3).optional(),
    }),
    handler: async (input: { csv: string; defaultCurrency?: string }, ctx: ToolContext) => {
      const result = await importExpensesFromCsv({
        csv: input.csv,
        db: ctx.deps.db,
        now: ctx.now,
        defaultCurrency: input.defaultCurrency,
      });
      if (result.importedCount === 0) throw new Error("no expense rows found in CSV");
      return {
        importedCount: result.importedCount,
        totalAmountCents: result.totalAmountCents,
        currency: result.currency,
        skippedCount: result.skipped.length,
      };
    },
  });
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cellValue += "\"";
      i += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cellValue.trim());
      cellValue = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cellValue.trim());
      rows.push(row);
      row = [];
      cellValue = "";
      continue;
    }
    cellValue += char;
  }

  row.push(cellValue.trim());
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeader(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

function getExpenseAmount(
  row: string[],
  amountIndex: number,
  debitIndex: number,
  creditIndex: number,
): { value: number; reason?: undefined } | { value: 0; reason: SkippedCsvExpense["reason"] } {
  const debit = parseMoney(cell(row, debitIndex));
  if (debit && debit > 0) return { value: debit };

  const credit = parseMoney(cell(row, creditIndex));
  if (credit && credit > 0) return { value: 0, reason: "credit_or_income" };

  const amount = parseMoney(cell(row, amountIndex));
  if (amount === null || amount === 0) return { value: 0, reason: "missing_amount" };
  if (amount > 0 && creditIndex >= 0) return { value: 0, reason: "credit_or_income" };
  return { value: Math.abs(amount) };
}

function parseMoney(value: string): number | null {
  const clean = value.replace(/[$£€₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvDate(value: string, fallback: Date): Date | null {
  if (!value) return fallback;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = Number(slash[3]!.length === 2 ? `20${slash[3]}` : slash[3]);
    return utcDate(year, Number(slash[2]), Number(slash[1]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
