// Feature 4: Morning brief — daily 7am cron.

import { z } from "zod";
import { upsertBrief } from "../db/repo.js";
import { formatBriefDate } from "../utils/time.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { AgentDeps } from "../agent/deps.js";

export interface BriefSections {
  date: string;
  body: string;
}

export interface BriefInputs {
  events: Array<{ title: string; start: Date }>;
  reminders: Array<{ text: string; fireAt: Date }>;
  topPriority?: string;
  weatherSummary?: string;
}

/**
 * Pure builder — turn structured inputs into the brief string.
 */
export function buildBrief(args: { now: Date; timezone: string; inputs: BriefInputs }): BriefSections {
  const date = formatBriefDate(args.now, args.timezone);
  const lines: string[] = [`Good morning. Brief for ${date}:`];

  if (args.inputs.topPriority) lines.push(`\n⭐ Top priority: ${args.inputs.topPriority}`);

  if (args.inputs.events.length) {
    lines.push("\n📅 Calendar:");
    for (const ev of args.inputs.events.slice(0, 6)) {
      const t = ev.start.toISOString().slice(11, 16);
      lines.push(`  • ${t} — ${ev.title}`);
    }
  } else {
    lines.push("\n📅 Calendar: nothing scheduled");
  }

  if (args.inputs.reminders.length) {
    lines.push("\n⏰ Reminders today:");
    for (const r of args.inputs.reminders.slice(0, 5)) {
      lines.push(`  • ${r.text}`);
    }
  }

  if (args.inputs.weatherSummary) lines.push(`\n☁️ Weather: ${args.inputs.weatherSummary}`);

  return { date, body: lines.join("\n") };
}

/**
 * Compose + send + persist. Used by the cron job.
 */
export async function runMorningBrief(args: {
  now: Date;
  ownerPhone: string;
  deps: AgentDeps;
  inputs: BriefInputs;
}): Promise<{ delivered: boolean }> {
  const brief = buildBrief({ now: args.now, timezone: args.deps.timezone, inputs: args.inputs });
  await upsertBrief(args.deps.db, brief.date, brief.body);
  await args.deps.whatsapp.send({ to: args.ownerPhone, body: brief.body });
  return { delivered: true };
}

export function registerMorningBrief(registry: ToolRegistry): void {
  registry.register({
    name: "send_morning_brief_now",
    description: "Compose and send today's morning brief immediately.",
    inputSchema: z.object({
      topPriority: z.string().optional(),
    }),
    handler: async (input: { topPriority?: string }, ctx: ToolContext) => {
      // For on-demand invocation we have minimal inputs; cron path supplies real ones.
      return runMorningBrief({
        now: ctx.now,
        ownerPhone: ctx.userPhone,
        deps: ctx.deps,
        inputs: { events: [], reminders: [], topPriority: input.topPriority },
      });
    },
  });
}
