// Feature 10: Receipt photo → expense logged + categorized.

import { z } from "zod";
import { insertExpense } from "../db/repo.js";
import { parseExpenseText } from "../utils/parse.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { ImageAnalyzer } from "../agent/deps.js";
import type { DB } from "../db/client.js";

const CATEGORIES = ["food", "transport", "groceries", "shopping", "bills", "entertainment", "health", "other"] as const;
type Category = (typeof CATEGORIES)[number];

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
    currency: fields.currency ?? "INR",
    category,
    merchant: fields.merchant,
    occurredAt: fields.date ?? args.now,
    sourceMessageId: args.sourceMessageId,
  });
  return { id: e.id, amount: fields.amount, currency: e.currency, category, merchant: e.merchant };
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
}
