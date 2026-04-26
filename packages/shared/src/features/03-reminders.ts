// Feature 3: Reminders — one-shot + recurring.
// Core logic is pure; cron firing is wired in apps/bot/src/scheduler.ts.

import { z } from "zod";
import { insertReminder, dueReminders, markReminderFired } from "../db/repo.js";
import { parseRelativeTime } from "../utils/time.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { DB } from "../db/client.js";
import type { WhatsAppClient } from "../whatsapp/client.js";

export interface PlanReminderResult {
  fireAt: Date;
  rrule: string | null;
  text: string;
}

/**
 * Plan a reminder from natural-language text. Pure — no DB writes.
 * Returns null if no time can be inferred.
 */
export function planReminder(args: {
  text: string;
  now: Date;
  timezone: string;
}): PlanReminderResult | null {
  const parsed = parseRelativeTime(args.text, args.now, args.timezone);
  if (!parsed) return null;
  const cleaned = args.text
    .replace(/\b(remind me (to|that)?|nudge me|don'?t let me forget)\b/gi, "")
    .replace(/\bin\s+\d+\s*(min(?:utes?)?|hours?|hrs?|days?)\b/gi, "")
    .replace(/\b(today|tomorrow|every\s+\w+)\b\s*(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?/gi, "")
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, "")
    .trim()
    .replace(/^[,:\s]+|[,:\s]+$/g, "");
  return {
    fireAt: parsed.fireAt,
    rrule: parsed.recurring ? buildRRuleFromText(args.text) : null,
    text: cleaned || args.text,
  };
}

function buildRRuleFromText(text: string): string | null {
  const m = text.toLowerCase().match(/\bevery\s+(mon|tue|wed|thu|fri|sat|sun)/);
  if (!m) return null;
  const map: Record<string, string> = {
    mon: "MO",
    tue: "TU",
    wed: "WE",
    thu: "TH",
    fri: "FR",
    sat: "SA",
    sun: "SU",
  };
  const code = map[m[1]!];
  return `FREQ=WEEKLY;BYDAY=${code}`;
}

/**
 * Cron handler: fire all due reminders. Returns count fired.
 */
export async function fireDueReminders(
  db: DB,
  whatsapp: WhatsAppClient,
  ownerPhone: string,
  now: Date,
): Promise<number> {
  const due = await dueReminders(db, now);
  for (const r of due) {
    await whatsapp.send({ to: ownerPhone, body: `⏰ Reminder: ${r.text}` });
    await markReminderFired(db, r.id);
    // Recurring: schedule the next occurrence.
    if (r.rrule) {
      const next = new Date(r.fireAt.getTime() + 7 * 24 * 60 * 60 * 1000); // weekly
      await insertReminder(db, { text: r.text, fireAt: next, rrule: r.rrule });
    }
  }
  return due.length;
}

export function registerReminders(registry: ToolRegistry): void {
  registry.register({
    name: "set_reminder",
    description:
      "Schedule a reminder. Use natural-language `when` like 'tomorrow 7am', 'in 2 hours', 'every monday 9am'.",
    inputSchema: z.object({
      text: z.string().min(1).describe("What to remind the user about"),
      when: z.string().min(1).describe("Natural-language time expression"),
    }),
    handler: async (input: { text: string; when: string }, ctx: ToolContext) => {
      const planned = planReminder({ text: input.when, now: ctx.now, timezone: ctx.timezone });
      if (!planned) throw new Error(`could not parse time: ${input.when}`);
      const r = await insertReminder(ctx.deps.db, {
        text: input.text,
        fireAt: planned.fireAt,
        rrule: planned.rrule,
      });
      return { id: r.id, fireAt: r.fireAt.toISOString(), rrule: r.rrule };
    },
  });
}
