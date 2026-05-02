// Feature 4: Morning brief -- daily 7am cron, also on-demand via "brief me".
// Aggregates events + unread emails from ALL configured email accounts.

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
  events: Array<{ title: string; start: Date; source?: string }>;
  reminders: Array<{ text: string; fireAt: Date }>;
  unreadEmails?: Array<{ source: string; from: string; subject: string }>;
  topPriority?: string;
  weatherSummary?: string;
}

export function buildBrief(args: { now: Date; timezone: string; inputs: BriefInputs }): BriefSections {
  const date = formatBriefDate(args.now, args.timezone);
  const lines: string[] = [`Good morning. Brief for ${date}:`];

  if (args.inputs.topPriority) lines.push(`\nTop priority: ${args.inputs.topPriority}`);

  // Events from all calendars
  if (args.inputs.events.length) {
    lines.push("\nCalendar:");
    for (const ev of args.inputs.events.slice(0, 8)) {
      const t = ev.start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: args.timezone });
      const src = ev.source ? ` [${ev.source}]` : "";
      lines.push(`- ${t} - ${ev.title}${src}`);
    }
  } else {
    lines.push("\nCalendar: nothing scheduled");
  }

  // Reminders today
  if (args.inputs.reminders.length) {
    lines.push("\nReminders today:");
    for (const r of args.inputs.reminders.slice(0, 6)) {
      lines.push(`- ${r.text}`);
    }
  }

  // Top unread email digest
  if (args.inputs.unreadEmails && args.inputs.unreadEmails.length) {
    lines.push(`\nTop unread (${args.inputs.unreadEmails.length} across accounts):`);
    for (const e of args.inputs.unreadEmails.slice(0, 8)) {
      const fromName = e.from.match(/"?([^"<]+?)"?\s*</)?.[1] ?? e.from.split("@")[0] ?? e.from;
      lines.push(`- [${e.source}] ${fromName.trim()} - ${e.subject}`);
    }
  }

  if (args.inputs.weatherSummary) lines.push(`\nWeather: ${args.inputs.weatherSummary}`);

  return { date, body: lines.join("\n") };
}

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
    description: "Compose and send today's morning brief immediately. Pulls events + unread emails from all configured accounts (Google + Outlook).",
    inputSchema: z.object({
      topPriority: z.string().optional(),
    }),
    handler: async (input: { topPriority?: string }, ctx: ToolContext) => {
      const events = await ctx.deps.aggregator?.fetchAllEventsToday(ctx.timezone).catch(() => []) ?? [];
      const unreadEmails = await ctx.deps.aggregator?.fetchAllUnreadEmails(3).catch(() => []) ?? [];

      return runMorningBrief({
        now: ctx.now,
        ownerPhone: ctx.userPhone,
        deps: ctx.deps,
        inputs: {
          events: events.map((e: any) => ({ title: e.title, start: e.start, source: e.source })),
          reminders: [],
          unreadEmails: unreadEmails.map((m: any) => ({ source: m.source, from: m.from, subject: m.subject })),
          topPriority: input.topPriority,
        },
      });
    },
  });
}
