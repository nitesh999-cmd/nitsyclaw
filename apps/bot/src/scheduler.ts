// node-cron schedules for: morning brief (with multi-account email + calendar),
// due reminders, memory pruner, confirmation expiry pruner, and local build-agent notification.

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import {
  findOrphansForOwner,
  fireDueReminders,
  fireDueSnoozes,
  runAutoEntityExtraction,
  runFocusEveningCloseOut,
  runMorningBrief,
  runPreMeetingBriefTick,
} from "@nitsyclaw/shared/features";
import { hashPhone } from "@nitsyclaw/shared/utils";
import { isInQuietHours } from "@nitsyclaw/shared/utils";
import { upsertSystemHeartbeat, pruneOldMessages, pruneExpiredConfirmations } from "@nitsyclaw/shared/db";
import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { privateOwnerTenantForPhone } from "@nitsyclaw/shared/tenancy";
import { fetchAllEventsToday, fetchAllUnreadEmails } from "./adapters.js";
import { runDailyBuildAgent } from "./build-agent.js";
import { sendNightlyWhatsAppHealthReport } from "./nightly-health-report.js";
import { formatSafeLogError, logBotError } from "./safe-log.js";

const MORNING_BRIEF_CRON = process.env.MORNING_BRIEF_CRON ?? "0 7 * * *";
const BUILD_AGENT_CRON = process.env.BUILD_AGENT_CRON ?? "0 12 * * *";
const WHATSAPP_HEALTH_REPORT_CRON = process.env.WHATSAPP_HEALTH_REPORT_CRON ?? "0 21 * * *";
const FOCUS_CLOSEOUT_CRON = process.env.FOCUS_CLOSEOUT_CRON ?? "30 20 * * *";
const ENTITY_EXTRACT_CRON = process.env.ENTITY_EXTRACT_CRON ?? "*/5 * * * *";
const PRE_MEETING_BRIEF_CRON = process.env.PRE_MEETING_BRIEF_CRON ?? "* * * * *";
const MEMORY_PRUNER_CRON = process.env.MEMORY_PRUNER_CRON ?? "0 3 * * *";
const PRUNE_MESSAGES_DAYS = Number(process.env.PRUNE_MESSAGES_DAYS ?? 90);

export interface SchedulerOpts {
  deps: AgentDeps;
  ownerPhone: string;
  quietStart: string;
  quietEnd: string;
}

export function startScheduler(opts: SchedulerOpts): { stop: () => void } {
  const tasks: ScheduledTask[] = [];

  async function writeHeartbeat(
    source: string,
    metadata: Record<string, unknown> = {},
    status = "ok",
  ) {
    await upsertSystemHeartbeat(opts.deps.db, {
      source,
      status,
      lastSeenAt: opts.deps.now(),
      metadata,
    });
  }

  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await writeHeartbeat("bot-scheduler", { scheduler: "alive" });
      } catch (e) {
        logBotError("[cron:heartbeat] error", e);
      }
    }),
  );

  writeHeartbeat("bot-scheduler", { scheduler: "started" }).catch((e) => {
    logBotError("[cron:heartbeat] initial error", e);
  });

  // Every minute - fire any due reminders.
  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await fireDueReminders(opts.deps.db, opts.deps.whatsapp, opts.ownerPhone, opts.deps.now());
        const snoozeResult = await fireDueSnoozes(
          opts.deps.db,
          opts.deps.whatsapp,
          opts.ownerPhone,
          opts.deps.now(),
        ).catch(() => ({ fired: 0 }));
        await writeHeartbeat("reminder-sweep", {
          lastReminderSweep: opts.deps.now().toISOString(),
          snoozesFired: snoozeResult.fired,
        });
      } catch (e) {
        await writeHeartbeat(
          "reminder-sweep",
          { error: formatSafeLogError(e) },
          "error",
        ).catch((heartbeatError) => {
          logBotError("[cron:heartbeat] reminder error status failed", heartbeatError);
        });
        logBotError("[cron:reminders] error", e);
      }
    }),
  );

  // 7am daily morning brief - multi-account aggregation.
  tasks.push(
    cron.schedule(MORNING_BRIEF_CRON, async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;

        const events = await fetchAllEventsToday(opts.deps.timezone).catch(() => []);
        const unreadEmails = await fetchAllUnreadEmails(3).catch(() => []);
        const orphanResult = await findOrphansForOwner(opts.deps.db, {
          ownerHash: hashPhone(opts.ownerPhone),
          now,
          windowHours: 48,
          staleContactDays: 7,
          limit: 5,
        }).catch(() => ({ items: [] as Array<{ kind: "reminder" | "snooze" | "stale_contact"; preview: string; due?: string }> }));

        await runMorningBrief({
          now,
          ownerPhone: opts.ownerPhone,
          deps: opts.deps,
          inputs: {
            events: events.map((e) => ({ title: e.title, start: e.start, source: e.source })),
            reminders: [],
            unreadEmails: unreadEmails.map((m) => ({ source: m.source, from: m.from, subject: m.subject })),
            orphans: orphanResult.items.map((i) => ({ kind: i.kind, preview: i.preview, due: i.due })),
          },
        });
      } catch (e) {
        logBotError("[cron:brief] error", e);
      }
    }),
  );

  // 12:00 UTC daily - local build agent (Option B, L36).
  // CCR sandbox blocks Supabase + ntfy so the CCR routine cannot run;
  // this fires from the always-on bot process instead and notifies Nitesh.
  tasks.push(
    cron.schedule(BUILD_AGENT_CRON, async () => {
      try {
        await runDailyBuildAgent(opts.deps, opts.ownerPhone);
      } catch (e) {
        logBotError("[cron:build] error", e);
      }
    }),
  );

  // 9pm daily - plain WhatsApp health report so failures are visible before the next day.
  tasks.push(
    cron.schedule(WHATSAPP_HEALTH_REPORT_CRON, async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;
        await sendNightlyWhatsAppHealthReport(opts.deps, opts.ownerPhone);
        await writeHeartbeat("whatsapp-nightly-health", { lastRun: now.toISOString() });
      } catch (e) {
        await writeHeartbeat(
          "whatsapp-nightly-health",
          { error: formatSafeLogError(e) },
          "error",
        ).catch((heartbeatError) => {
          logBotError("[cron:heartbeat] nightly health error status failed", heartbeatError);
        });
        logBotError("[cron:nightly-health] error", e);
      }
    }, { timezone: opts.deps.timezone }),
  );

  // Every 5 min - auto entity extraction (Feature 30) over recent owner messages.
  tasks.push(
    cron.schedule(ENTITY_EXTRACT_CRON, async () => {
      try {
        const result = await runAutoEntityExtraction(
          opts.deps.db,
          opts.deps.llm,
          opts.ownerPhone,
          { lookbackMs: 15 * 60 * 1000, perTickLimit: 10 },
        );
        await writeHeartbeat("entity-extract", {
          lastRun: opts.deps.now().toISOString(),
          ...result,
        });
      } catch (e) {
        await writeHeartbeat("entity-extract", { error: formatSafeLogError(e) }, "error").catch(() => {});
        logBotError("[cron:entity-extract] error", e);
      }
    }),
  );

  // Every minute - pre-meeting briefing tick (Feature 31). Fires once per
  // calendar event in the [now+8min, now+15min] window. Per-process dedupe.
  tasks.push(
    cron.schedule(PRE_MEETING_BRIEF_CRON, async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;
        const result = await runPreMeetingBriefTick(
          opts.deps.db,
          opts.deps.whatsapp,
          opts.deps.aggregator,
          opts.ownerPhone,
          now,
          opts.deps.timezone,
        );
        if (result.briefed > 0 || result.scanned > 0) {
          await writeHeartbeat("pre-meeting-brief", {
            lastRun: now.toISOString(),
            ...result,
          });
        }
      } catch (e) {
        await writeHeartbeat("pre-meeting-brief", { error: formatSafeLogError(e) }, "error").catch(() => {});
        logBotError("[cron:pre-meeting] error", e);
      }
    }),
  );

  // 20:30 user-tz daily - evening close-out for Daily Focus Theme (Feature 25).
  tasks.push(
    cron.schedule(FOCUS_CLOSEOUT_CRON, async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;
        const result = await runFocusEveningCloseOut(
          opts.deps.db,
          opts.deps.whatsapp,
          opts.ownerPhone,
          now,
          opts.deps.timezone,
        );
        await writeHeartbeat("focus-closeout", {
          lastRun: now.toISOString(),
          state: result.state,
          delivered: result.delivered,
        });
      } catch (e) {
        await writeHeartbeat("focus-closeout", { error: formatSafeLogError(e) }, "error").catch(() => {});
        logBotError("[cron:focus-closeout] error", e);
      }
    }, { timezone: opts.deps.timezone }),
  );

  // 3am daily - memory pruner: delete messages older than PRUNE_MESSAGES_DAYS (default 90).
  tasks.push(
    cron.schedule(MEMORY_PRUNER_CRON, async () => {
      try {
        const now = opts.deps.now();
        const cutoff = new Date(now.getTime() - PRUNE_MESSAGES_DAYS * 24 * 60 * 60 * 1000);
        await pruneOldMessages(opts.deps.db, cutoff);
        console.log(`[cron:prune] pruned messages older than ${PRUNE_MESSAGES_DAYS} days (cutoff: ${cutoff.toISOString()})`);
        const expired = await pruneExpiredConfirmations(opts.deps.db, privateOwnerTenantForPhone(opts.ownerPhone), now);
        if (expired > 0) console.log(`[cron:prune] expired ${expired} confirmation(s)`);
        await writeHeartbeat("memory-pruner", { lastRun: now.toISOString() });
      } catch (e) {
        await writeHeartbeat("memory-pruner", { error: formatSafeLogError(e) }, "error").catch(() => {});
        logBotError("[cron:prune] error", e);
      }
    }),
  );

  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
