/**
 * Cheap rule-based intent classifier. Used as fast-path before falling back to the
 * Claude tool-use loop. Exhaustive matching is the LLM's job — this just catches
 * the obvious ones for sub-100ms response on common requests.
 */
export type Intent =
  | "set_reminder"
  | "morning_brief"
  | "whats_on_my_plate"
  | "memory_recall"
  | "schedule_call"
  | "web_research"
  | "log_expense"
  | "confirmation"
  | "unknown";

const RULES: Array<{ intent: Intent; pattern: RegExp }> = [
  { intent: "set_reminder", pattern: /\b(remind me|reminder|don'?t let me forget|nudge me)\b/i },
  { intent: "morning_brief", pattern: /\b(morning brief|brief me|daily brief|good morning)\b/i },
  { intent: "whats_on_my_plate", pattern: /\b(what'?s on my plate|what'?s today|today'?s plan|whats next)\b/i },
  { intent: "memory_recall", pattern: /\b(where did i (save|put)|do you remember|find (the|that) (note|thing|article|link))\b/i },
  { intent: "schedule_call", pattern: /\b(schedule (a )?(call|meeting)|book a slot|set up (a )?meeting)\b/i },
  { intent: "web_research", pattern: /\b(look up|research|google|find out about)\b/i },
  { intent: "log_expense", pattern: /\b(spent|paid|expense|received|bought|gave .* for|₹|rs\.?|inr|usd)\b/i },
  { intent: "confirmation", pattern: /^\s*(y|yes|n|no|cancel|approve|reject)\b/i },
];

export function detectIntent(text: string): Intent {
  const t = text.trim();
  for (const r of RULES) if (r.pattern.test(t)) return r.intent;
  return "unknown";
}

/**
 * Parse "spent 200 on coffee at starbucks" → { amount: 200, category: 'coffee', merchant: 'starbucks' }
 * Best-effort. Returns null if amount can't be found.
 */
export function parseExpenseText(text: string): {
  amountCents: number;
  currency: string;
  category?: string;
  merchant?: string;
} | null {
  const m = text.match(/(?:₹|rs\.?|inr|usd|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|usd|\$)?/i);
  if (!m) return null;
  const amount = parseFloat(m[1]!);
  if (isNaN(amount)) return null;
  const lower = text.toLowerCase();
  const currency = /\$|usd/.test(lower) ? "USD" : "INR";

  let category: string | undefined;
  let merchant: string | undefined;
  const onMatch = text.match(/\bon\s+([\w\s]+?)(?:\s+at\s+|\s*$)/i);
  if (onMatch) category = onMatch[1]!.trim().toLowerCase();
  const atMatch = text.match(/\bat\s+([\w\s]+?)(?:\s*$|\s+for\s+)/i);
  if (atMatch) merchant = atMatch[1]!.trim();

  return { amountCents: Math.round(amount * 100), currency, category, merchant };
}
