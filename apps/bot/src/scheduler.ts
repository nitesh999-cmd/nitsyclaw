// node-cron schedules for: morning brief (with multi-account email + calendar),
// due reminders, memory pruner, and local build-agent notification.

import cron from "node-cron";
import { fireDueReminders, runMorningBrief } from "@nitsyclaw/shared/features";
import { isInQuietHours } from "@nitsyclaw/shared/utils";
import { upsertSystemHeartbeat, pruneOldMessages } from "@nitsyclaw/shared/db";
import type { AgentDeps } from "@nitsyclaw/shared/agent";
import { fetchAllEventsToday, fetchAllUnreadEmails } from "./adapters.js";
import { runDailyBuildAgent } from "./build-agent.js";

const MORNING_BRIEF_CRON = process.env.MORNING_BRIEF_CRON ?? "0 7 * * *";
const BUILD_AGENT_CRON = process.env.BUILD_AGENT_CRON ?? "0 12 * * *";
const MEMORY_PRUNER_CRON = process.env.MEMORY_PRUNER_CRON ?? "0 3 * * *";
const PRUNE_MESSAGES_DAYS = Number(process.env.PRUNE_MESSAGES_DAYS ?? 90);

export interface SchedulerOpts {
  deps: AgentDeps;
  ownerPhone: string;
  quietStart: string;
  quietEnd: string;
}

export function startScheduler(opts: SchedulerOpts): { stop: () => void } {
  const tasks: cron.ScheduledTask[] = [];

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
        console.error("[cron:heartbeat] error", e);
      }
    }),
  );

  writeHeartbeat("bot-scheduler", { scheduler: "started" }).catch((e) => {
    console.error("[cron:heartbeat] initial error", e);
  });

  // Every minute - fire any due reminders.
  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await fireDueReminders(opts.deps.db, opts.deps.whatsapp, opts.ownerPhone, opts.deps.now());
        await writeHeartbeat("reminder-sweep", { lastReminderSweep: opts.deps.now().toISOString() });
      } catch (e) {
        await writeHeartbeat(
          "reminder-sweep",
          { error: e instanceof Error ? e.message : String(e) },
          "error",
        ).catch((heartbeatError) => {
          console.error("[cron:heartbeat] reminder error status failed", heartbeatError);
        });
        console.error("[cron:reminders] error", e);
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

  // 12:00 UTC daily - local build agent (Option B, L36).
  // CCR sandbox blocks Supabase + ntfy so the CCR routine cannot run;
  // this fires from the always-on bot process instead and notifies Nitesh.
  tasks.push(
    cron.schedule(BUILD_AGENT_CRON, async () => {
      try {
        await runDailyBuildAgent(opts.deps, opts.ownerPhone);
      } catch (e) {
        console.error("[cron:build] error", e);
      }
    }),
  );

  // 3am daily - memory pruner: delete messages older than PRUNE_MESSAGES_DAYS (default 90).
  tasks.push(
    cron.schedule(MEMORY_PRUNER_CRON, async () => {
      try {
        const cutoff = new Date(Date.now() - PRUNE_MESSAGES_DAYS * 24 * 60 * 60 * 1000);
        await pruneOldMessages(opts.deps.db, cutoff);
        console.log(`[cron:prune] pruned messages older than ${PRUNE_MESSAGES_DAYS} days (cutoff: ${cutoff.toISOString()})`);
      } catch (e) {
        console.error("[cron:prune] error", e);
      }
    }),
  );

  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
