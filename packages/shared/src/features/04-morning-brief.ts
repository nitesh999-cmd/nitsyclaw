// Feature 4: Morning brief -- daily 7am cron, also on-demand via "brief me".
// Aggregates events + unread emails from ALL configured email accounts.

import { z } from "zod";
import {
  listPendingFeatureRequests,
  listPendingReminders,
  recentMessages,
  upsertBrief,
} from "../db/repo.js";
import { formatBriefDate } from "../utils/time.js";
import type { ToolContext, ToolRegistry } from "../agent/tools.js";
import type { AgentDeps } from "../agent/deps.js";
import { privateOwnerTenantForPhone } from "../tenancy.js";

export interface BriefSections {
  date: string;
  body: string;
}

export interface BriefInputs {
  events: Array<{ title: string; start: Date; source?: string }>;
  reminders: Array<{ text: string; fireAt: Date }>;
  unreadEmails?: Array<{ source: string; from: string; subject: string }>;
  whatsappFollowUps?: Array<{ text: string; createdAt: Date }>;
  queueItems?: Array<{ description: string; type?: string; severity?: string | null; createdAt: Date }>;
  topPriority?: string;
  weatherSummary?: string;
  locationUsed?: string;
}

interface AggregatedEvent {
  title: string;
  start: Date;
  source?: string;
}

interface AggregatedUnreadEmail {
  source: string;
  from: string;
  subject: string;
}

export function buildBrief(args: { now: Date; timezone: string; inputs: BriefInputs }): BriefSections {
  const date = formatBriefDate(args.now, args.timezone);
  const lines: string[] = [`Good morning. Brief for ${date}:`];
  const actionLines = buildActionLines(args.inputs);

  if (args.inputs.topPriority) lines.push(`\nTop priority: ${args.inputs.topPriority}`);

  if (actionLines.length) {
    lines.push("\nTop actions:");
    for (const action of actionLines.slice(0, 5)) lines.push(`- ${action}`);
  }

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
  if (args.inputs.locationUsed && args.inputs.weatherSummary) lines.push(`Location used: ${args.inputs.locationUsed}`);

  if (args.inputs.whatsappFollowUps?.length) {
    lines.push(`\nWhatsApp follow-ups (${args.inputs.whatsappFollowUps.length} recent):`);
    for (const msg of args.inputs.whatsappFollowUps.slice(0, 4)) {
      const time = msg.createdAt.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: args.timezone,
      });
      lines.push(`- ${time} - ${summarizeLine(msg.text, 90)}`);
    }
  }

  if (args.inputs.queueItems?.length) {
    lines.push(`\nBuild queue: ${args.inputs.queueItems.length} pending`);
    for (const item of args.inputs.queueItems.slice(0, 3)) {
      const severity = item.severity ? `${item.severity} ` : "";
      lines.push(`- ${severity}${summarizeLine(item.description, 90)}`);
    }
  }

  return { date, body: lines.join("\n") };
}

function buildActionLines(inputs: BriefInputs): string[] {
  const actions: string[] = [];
  if (inputs.topPriority) actions.push(inputs.topPriority);
  const nextReminder = [...inputs.reminders].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0];
  if (nextReminder) actions.push(`Next reminder: ${nextReminder.text}`);
  const nextEvent = [...inputs.events].sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (nextEvent) actions.push(`Next calendar item: ${nextEvent.title}`);
  const firstUnread = inputs.unreadEmails?.[0];
  if (firstUnread) actions.push(`Check unread: ${firstUnread.subject}`);
  const firstQueueItem = inputs.queueItems?.[0];
  if (firstQueueItem) actions.push(`Build queue: ${summarizeLine(firstQueueItem.description, 70)}`);
  return [...new Set(actions)];
}

function summarizeLine(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export async function runMorningBrief(args: {
  now: Date;
  ownerPhone: string;
  deps: AgentDeps;
  inputs: BriefInputs;
}): Promise<{ delivered: boolean }> {
  const brief = buildBrief({ now: args.now, timezone: args.deps.timezone, inputs: args.inputs });
  await upsertBrief(args.deps.db, privateOwnerTenantForPhone(args.ownerPhone), brief.date, brief.body);
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
      const [events, unreadEmails, reminders, queueItems, whatsappFollowUps, weather] = await Promise.all([
        ctx.deps.aggregator?.fetchAllEventsToday(ctx.timezone).catch(() => []) ?? [],
        ctx.deps.aggregator?.fetchAllUnreadEmails(3).catch(() => []) ?? [],
        listPendingReminders(ctx.deps.db, privateOwnerTenantForPhone(ctx.userPhone), ctx.now, 6).catch(() => []),
        listPendingFeatureRequests(ctx.deps.db).then((rows) => rows.slice(0, 5)).catch(() => []),
        recentMessages(ctx.deps.db, ctx.userPhone, 10)
          .then((rows) =>
            rows
              .filter((row) => row.direction === "in")
              .slice(0, 4)
              .map((row) => ({ text: row.transcript || row.body, createdAt: row.createdAt })),
          )
          .catch(() => []),
        resolveWeatherSummary(ctx.deps).catch(() => null),
      ]);

      return runMorningBrief({
        now: ctx.now,
        ownerPhone: ctx.userPhone,
        deps: ctx.deps,
        inputs: {
          events: (events as AggregatedEvent[]).map((e) => ({ title: e.title, start: e.start, source: e.source })),
          unreadEmails: (unreadEmails as AggregatedUnreadEmail[]).map((m) => ({
            source: m.source,
            from: m.from,
            subject: m.subject,
          })),
          reminders: reminders.map((r) => ({ text: r.text, fireAt: r.fireAt })),
          whatsappFollowUps,
          queueItems: queueItems.map((item) => ({
            description: item.description,
            type: item.type,
            severity: item.severity,
            createdAt: item.createdAt,
          })),
          topPriority: input.topPriority,
          weatherSummary: weather?.summary,
          locationUsed: weather?.location,
        },
      });
    },
  });
}

async function resolveWeatherSummary(deps: AgentDeps): Promise<{ location: string; summary: string } | null> {
  const location = deps.profile?.currentLocation || deps.profile?.homeLocation;
  if (!location) return null;
  const results = await deps.webSearch.search(`weather today ${location}`);
  const first = results[0];
  if (!first) return null;
  return {
    location,
    summary: summarizeLine(first.snippet || first.title, 140),
  };
}
