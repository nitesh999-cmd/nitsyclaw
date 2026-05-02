// Feature 5: "What's on my plate today?"
// Aggregates events + reminders from all sources.

import { z } from "zod";
import { startOfDay, addDays } from "../utils/time.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { AgentDeps } from "../agent/deps.js";
import { dueReminders } from "../db/repo.js";

export interface PlateSummary {
  events: Array<{ title: string; start: Date; source?: string }>;
  reminders: Array<{ text: string; fireAt: Date }>;
  text: string;
}

export async function summarizeToday(args: {
  now: Date;
  deps: AgentDeps;
}): Promise<PlateSummary> {
  const start = startOfDay(args.now);
  const end = addDays(start, 1);

  // Pull events from all accounts via injected aggregator.
  let events: Array<{ title: string; start: Date; source?: string }> = [];
  try {
    const all = await args.deps.aggregator?.fetchAllEventsToday(args.deps.timezone);
    events = (all ?? []).map((e) => ({ title: e.title, start: e.start, source: e.source }));
  } catch {
    // Fallback to single-source if aggregator unavailable (e.g. tests)
    if (args.deps.calendar.listEventsToday) {
      events = (await args.deps.calendar.listEventsToday(args.deps.timezone).catch(() => []))
        .map((e) => ({ title: e.title, start: e.start }));
    }
  }

  const reminders = (await dueReminders(args.deps.db, end)).map((r) => ({ text: r.text, fireAt: r.fireAt }));

  const lines: string[] = ["Today's plate:"];
  if (events.length) {
    lines.push("\nEvents:");
    events.slice(0, 8).forEach((e) => {
      const t = e.start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: args.deps.timezone });
      const src = e.source ? ` [${e.source}]` : "";
      lines.push(`- ${t} ${e.title}${src}`);
    });
  }
  if (reminders.length) {
    lines.push("\nReminders:");
    reminders.forEach((r) => lines.push(`- ${r.text}`));
  }
  if (events.length + reminders.length === 0) lines.push("\nNothing scheduled. Wide open.");

  return { events, reminders, text: lines.join("\n") };
}

export function registerWhatsOnMyPlate(registry: ToolRegistry): void {
  registry.register({
    name: "whats_on_my_plate",
    description: "Summarize what the user has scheduled and what reminders fire today, across all linked calendars.",
    inputSchema: z.object({}),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      return summarizeToday({ now: ctx.now, deps: ctx.deps });
    },
  });
}
