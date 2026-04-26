// node-cron schedules for: morning brief, due reminders, memory pruner, backups.
// Quiet hours respected per env.

import cron from "node-cron";
import { fireDueReminders, runMorningBrief } from "@nitsyclaw/shared/features";
import { isInQuietHours } from "@nitsyclaw/shared/utils";
import type { AgentDeps } from "@nitsyclaw/shared/agent";

export interface SchedulerOpts {
  deps: AgentDeps;
  ownerPhone: string;
  quietStart: string;
  quietEnd: string;
}

export function startScheduler(opts: SchedulerOpts): { stop: () => void } {
  const tasks: cron.ScheduledTask[] = [];

  // Every minute — fire any due reminders. Reminders ignore quiet hours; user
  // explicitly asked for them.
  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await fireDueReminders(opts.deps.db, opts.deps.whatsapp, opts.ownerPhone, opts.deps.now());
      } catch (e) {
        console.error("[cron:reminders] error", e);
      }
    }),
  );

  // 7am daily morning brief.
  tasks.push(
    cron.schedule("0 7 * * *", async () => {
      try {
        const now = opts.deps.now();
        if (isInQuietHours(now, opts.deps.timezone, opts.quietStart, opts.quietEnd)) return;
        await runMorningBrief({
          now,
          ownerPhone: opts.ownerPhone,
          deps: opts.deps,
          inputs: { events: [], reminders: [] },
        });
      } catch (e) {
        console.error("[cron:brief] error", e);
      }
    }),
  );

  // 3am daily — memory pruner stub (R6 — purge raw logs >30 days).
  tasks.push(
    cron.schedule("0 3 * * *", async () => {
      // TODO v1.1: implement pruning. For v1 it's a noop logged for visibility.
      console.log("[cron:prune] noop placeholder");
    }),
  );

  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}
