# Wires the multi-account email + calendar aggregator into:
# - the morning brief (cron + on-demand "brief me")
# - the "what's on my plate today" feature
#
# After this, sending "brief me" on WhatsApp returns:
#   - Calendar events from Google personal + Google Solar Harbour + Outlook Wattage
#   - Top unread emails from same accounts
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\merge-all-into-brief.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Wiring multi-account email + calendar" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. Update 04-morning-brief.ts to use aggregator
# ============================================================
$briefContent = @'
// Feature 4: Morning brief — daily 7am cron, also on-demand via "brief me".
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

  if (args.inputs.topPriority) lines.push(`\n⭐ Top priority: ${args.inputs.topPriority}`);

  // Events from all calendars
  if (args.inputs.events.length) {
    lines.push("\n📅 Calendar:");
    for (const ev of args.inputs.events.slice(0, 8)) {
      const t = ev.start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: args.timezone });
      const src = ev.source ? ` [${ev.source}]` : "";
      lines.push(`  • ${t} — ${ev.title}${src}`);
    }
  } else {
    lines.push("\n📅 Calendar: nothing scheduled");
  }

  // Reminders today
  if (args.inputs.reminders.length) {
    lines.push("\n⏰ Reminders today:");
    for (const r of args.inputs.reminders.slice(0, 6)) {
      lines.push(`  • ${r.text}`);
    }
  }

  // Top unread email digest
  if (args.inputs.unreadEmails && args.inputs.unreadEmails.length) {
    lines.push(`\n📧 Top unread (${args.inputs.unreadEmails.length} across accounts):`);
    for (const e of args.inputs.unreadEmails.slice(0, 8)) {
      const fromName = e.from.match(/"?([^"<]+?)"?\s*</)?.[1] ?? e.from.split("@")[0];
      lines.push(`  • [${e.source}] ${fromName.trim()} — ${e.subject}`);
    }
  }

  if (args.inputs.weatherSummary) lines.push(`\n☁️ Weather: ${args.inputs.weatherSummary}`);

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
      // Lazy-load aggregator to avoid pulling googleapis in tests
      const { fetchAllEventsToday, fetchAllUnreadEmails } = await import("../../../../apps/bot/src/adapters.js").catch(() => ({
        fetchAllEventsToday: async () => [] as any[],
        fetchAllUnreadEmails: async () => [] as any[],
      }));

      const events = await fetchAllEventsToday(ctx.timezone).catch(() => [] as any[]);
      const unreadEmails = await fetchAllUnreadEmails(3).catch(() => [] as any[]);

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
'@
[System.IO.File]::WriteAllText("$root\packages\shared\src\features\04-morning-brief.ts", $briefContent, $enc)
Write-Host "  [1/3] Updated 04-morning-brief.ts" -ForegroundColor Green

# ============================================================
# 2. Update scheduler.ts cron to use aggregator
# ============================================================
$schedulerContent = @'
// node-cron schedules for: morning brief (with multi-account email + calendar),
// due reminders, memory pruner.

import cron from "node-cron";
import { fireDueReminders, runMorningBrief } from "@nitsyclaw/shared/features";
import { isInQuietHours } from "@nitsyclaw/shared/utils";
import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { fetchAllEventsToday, fetchAllUnreadEmails } from "./adapters.js";

export interface SchedulerOpts {
  deps: AgentDeps;
  ownerPhone: string;
  quietStart: string;
  quietEnd: string;
}

export function startScheduler(opts: SchedulerOpts): { stop: () => void } {
  const tasks: cron.ScheduledTask[] = [];

  // Every minute — fire any due reminders.
  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await fireDueReminders(opts.deps.db, opts.deps.whatsapp, opts.ownerPhone, opts.deps.now());
      } catch (e) {
        console.error("[cron:reminders] error", e);
      }
    }),
  );

  // 7am daily morning brief — multi-account aggregation.
  tasks.push(
    cron.schedule("0 7 * * *", async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;

        const events = await fetchAllEventsToday(opts.deps.timezone).catch(() => []);
        const unreadEmails = await fetchAllUnreadEmails(3).catch(() => []);

        await runMorningBrief({
          now,
          ownerPhone: opts.ownerPhone,
          deps: opts.deps,
          inputs: {
            events: events.map((e) => ({ title: e.title, start: e.start, source: e.source })),
            reminders: [],
            unreadEmails: unreadEmails.map((m) => ({ source: m.source, from: m.from, subject: m.subject })),
          },
        });
      } catch (e) {
        console.error("[cron:brief] error", e);
      }
    }),
  );

  // 3am daily — memory pruner stub.
  tasks.push(
    cron.schedule("0 3 * * *", async () => {
      console.log("[cron:prune] noop placeholder");
    }),
  );

  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\scheduler.ts", $schedulerContent, $enc)
Write-Host "  [2/3] Updated scheduler.ts cron" -ForegroundColor Green

# ============================================================
# 3. Update 05-whats-on-my-plate.ts to use aggregator
# ============================================================
$plateContent = @'
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

  // Pull events from all accounts via aggregator
  let events: Array<{ title: string; start: Date; source?: string }> = [];
  try {
    const { fetchAllEventsToday } = await import("../../../../apps/bot/src/adapters.js");
    const all = await fetchAllEventsToday(args.deps.timezone);
    events = all.map((e: any) => ({ title: e.title, start: e.start, source: e.source }));
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
    lines.push("\n📅 Events:");
    events.slice(0, 8).forEach((e) => {
      const t = e.start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: args.deps.timezone });
      const src = e.source ? ` [${e.source}]` : "";
      lines.push(`  • ${t} ${e.title}${src}`);
    });
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
    description: "Summarize what the user has scheduled and what reminders fire today, across all linked calendars.",
    inputSchema: z.object({}),
    handler: async (_input: Record<string, never>, ctx: ToolContext) => {
      return summarizeToday({ now: ctx.now, deps: ctx.deps });
    },
  });
}
'@
[System.IO.File]::WriteAllText("$root\packages\shared\src\features\05-whats-on-my-plate.ts", $plateContent, $enc)
Write-Host "  [3/3] Updated 05-whats-on-my-plate.ts" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " All wired. Now restart the bot:" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " powershell -ExecutionPolicy Bypass -File $root\nuke-and-go.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host " Or wait ~10 sec for tsx watch to auto-reload." -ForegroundColor Gray
Write-Host ""
Write-Host " Then on WhatsApp self-chat, send:" -ForegroundColor White
Write-Host "    brief me" -ForegroundColor Yellow
Write-Host ""
Write-Host " Should now show:" -ForegroundColor White
Write-Host "  - Events from Google personal, Google Solar Harbour, and Outlook Wattage" -ForegroundColor Gray
Write-Host "  - Top unread emails from same accounts" -ForegroundColor Gray
Write-Host ""
