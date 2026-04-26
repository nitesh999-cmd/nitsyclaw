// Feature 5: "What's on my plate today?"

import { z } from "zod";
import { startOfDay, addDays } from "../utils/time.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { AgentDeps } from "../agent/deps.js";
import { dueReminders } from "../db/repo.js";

export interface PlateSummary {
  events: Array<{ title: string; start: Date }>;
  reminders: Array<{ text: string; fireAt: Date }>;
  text: string;
}

export async function summarizeToday(args: {
  now: Date;
  deps: AgentDeps;
}): Promise<PlateSummary> {
  const start = startOfDay(args.now);
  const end = addDays(start, 1);
  const events = await args.deps.calendar
    .suggestSlots({ durationMin: 0, participants: [], window: { start, end } })
    .catch(() => [] as Date[])
    .then(() => [] as Array<{ title: string; start: Date }>); // suggestSlots is for finding free slots; events come from listEvents (out of v1 scope).
  // For v1 we surface reminders + a placeholder for events; calendar event list is added in P1.
  const reminders = (await dueReminders(args.deps.db, end)).map((r) => ({ text: r.text, fireAt: r.fireAt }));

  const lines: string[] = ["Today's plate:"];
  if (events.length) {
    lines.push("\n📅 Events:");
    events.forEach((e) => lines.push(`  • ${e.start.toISOString().slice(11, 16)} ${e.title}`));
  }
  if (reminders.length) {
    lines.push("\n⏰ Reminders:");
    reminders.forEach((r) => lines.push(`  • ${r.text}`));
  }
  if (events.length + reminders.length === 0) lines.push("\n✨ Nothing scheduled. Wide open.");

  return { events, reminders, text: lines.join("\n") };
}

export function registerWhatsOnMyPlate(registry: ToolRegistry): void {
  registry.register({
    name: "whats_on_my_plate",
    description: "Summarize what the user has scheduled and what reminders fire today.",
    inputSchema: z.object({}),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      return summarizeToday({ now: ctx.now, deps: ctx.deps });
    },
  });
}
