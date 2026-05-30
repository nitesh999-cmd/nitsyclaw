import type { DB } from "../db/client.js";
import {
  insertExpense,
  insertFeatureRequest,
  insertMemory,
  insertReminder,
} from "../db/repo.js";
import type { TenantContext } from "../tenancy.js";
import { categorizeExpense } from "../features/10-receipt-expense.js";
import { planReminder } from "../features/03-reminders.js";
import { parseExpenseText } from "../utils/parse.js";

export type OneCommandCaptureKind =
  | "idea"
  | "task"
  | "bug"
  | "expense"
  | "person"
  | "reminder"
  | "location"
  | "note"
  | "feature";

export interface ExplicitOneCommandCapture {
  kind: OneCommandCaptureKind;
  body: string;
  original: string;
}

export interface OneCommandCaptureResult {
  handled: boolean;
  reply: string;
  toolName?: string;
}

const PREFIX_RE = /^\s*(idea|task|todo|bug|expense|spent|person|contact|reminder|remind|location|note|remember|feature|add feature)\s*[:-]\s*(.+)$/is;

export function parseExplicitOneCommandCapture(text: string): ExplicitOneCommandCapture | null {
  const trimmed = text.trim();
  const match = trimmed.match(PREFIX_RE);
  if (!match) return null;

  const rawKind = (match[1] ?? "").toLowerCase();
  const body = (match[2] ?? "").replace(/\s+/g, " ").trim();
  if (body.length < 2) return null;

  const kind: OneCommandCaptureKind =
    rawKind === "todo" ? "task" :
    rawKind === "spent" ? "expense" :
    rawKind === "contact" ? "person" :
    rawKind === "remind" ? "reminder" :
    rawKind === "remember" ? "note" :
    rawKind === "add feature" ? "feature" :
    rawKind as OneCommandCaptureKind;

  return { kind, body, original: trimmed };
}

export async function executeOneCommandCapture(args: {
  db: DB;
  tenant: TenantContext;
  text: string;
  source: "whatsapp" | "dashboard";
  requestedBy: string;
  now: Date;
  timezone: string;
  sourceMessageId?: string;
}): Promise<OneCommandCaptureResult | null> {
  const explicit = parseExplicitOneCommandCapture(args.text);
  if (!explicit) return null;

  if (explicit.kind === "bug" || explicit.kind === "feature") {
    const row = await insertFeatureRequest(args.db, {
      description: explicit.body,
      type: explicit.kind === "bug" ? "bug" : "feature",
      severity: explicit.kind === "bug" ? "P2" : null,
      size: "S",
      source: args.source,
      requestedBy: args.requestedBy,
    });
    return {
      handled: true,
      toolName: "request_feature",
      reply: `${explicit.kind === "bug" ? "Bug queued" : "Feature queued"}: ${row.id.slice(0, 8)}\nSaved to the build queue. No external action was taken.`,
    };
  }

  if (explicit.kind === "expense") {
    const parsed = parseExpenseText(explicit.body);
    if (!parsed) {
      return {
        handled: true,
        toolName: "log_expense_text",
        reply: "I can log that expense, but I need the amount. Try: expense: $18.40 at Chemist Warehouse for medicine.",
      };
    }
    const category = parsed.category ?? categorizeExpense({ merchant: parsed.merchant, rawText: explicit.body });
    const row = await insertExpense(args.db, args.tenant, {
      amount: parsed.amountCents,
      currency: parsed.currency,
      category,
      merchant: parsed.merchant,
      occurredAt: args.now,
      sourceMessageId: args.sourceMessageId,
    });
    return {
      handled: true,
      toolName: "log_expense_text",
      reply: [
        `Expense logged: ${row.currency} ${(row.amount / 100).toFixed(2)}`,
        `Category: ${row.category}`,
        row.merchant ? `Merchant: ${row.merchant}` : undefined,
        "No bank connection was used.",
      ].filter((line): line is string => Boolean(line)).join("\n"),
    };
  }

  if (explicit.kind === "reminder") {
    const planned = planReminder({
      text: explicit.body,
      now: args.now,
      timezone: args.timezone,
    });
    if (!planned) {
      return {
        handled: true,
        toolName: "set_reminder",
        reply: "I can set that reminder, but I need a time. Try: reminder: call Mukesh tomorrow at 10 am.",
      };
    }
    const row = await insertReminder(args.db, args.tenant, {
      text: planned.text,
      fireAt: planned.fireAt,
      rrule: planned.rrule,
    });
    return {
      handled: true,
      toolName: "set_reminder",
      reply: [
        `Reminder set: ${row.text}`,
        `When: ${row.fireAt.toISOString()}`,
        "Saved in NitsyClaw reminders. Delivery: WhatsApp self-chat.",
      ].join("\n"),
    };
  }

  const memoryKind = explicit.kind === "person" || explicit.kind === "location" ? "fact" : "note";
  const row = await insertMemory(args.db, args.tenant, {
    kind: memoryKind,
    content: explicit.body,
    tags: ["capture", explicit.kind],
    sourceMessageId: args.sourceMessageId,
  });

  return {
    handled: true,
    toolName: "parse_one_command_capture",
    reply: `Captured ${explicit.kind}: ${row.id.slice(0, 8)}\nSaved to NitsyClaw memory. No external action was taken.`,
  };
}
