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

  // Every minute â€” fire any due reminders.
  tasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await fireDueReminders(opts.deps.db, opts.deps.whatsapp, opts.ownerPhone, opts.deps.now());
      } catch (e) {
        console.error("[cron:reminders] error", e);
      }
    }),
  );

  // 7am daily morning brief â€” multi-account aggregation.
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

  // 3am daily â€” memory pruner stub.
  tasks.push(
    cron.schedule("0 3 * * *", async () => {
      console.log("[cron:prune] noop placeholder");
    }),
  );

  return {
    stop: () => tasks.forEach((t) => t.stop()),
  };
}