import { claimSystemNotification, type DB } from "@nitsyclaw/shared/db";

export type ScheduledRunCadence = "daily" | "five_minute";

type Claim = typeof claimSystemNotification;

export function scheduledRunKey(
  name: string,
  now: Date,
  timezone: string,
  cadence: ScheduledRunCadence,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  if (cadence === "daily") return `${name}:${date}`;
  const minute = Math.floor(Number(value("minute")) / 5) * 5;
  return `${name}:${date}T${value("hour")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Persistent at-most-once claim for scheduled work. A second bot process, or
 * a process restarted in the same schedule bucket, must not repeat an outward
 * message whose first attempt may already have reached WhatsApp.
 */
export async function claimScheduledRun(
  db: DB,
  args: {
    name: string;
    now: Date;
    timezone: string;
    cadence: ScheduledRunCadence;
  },
  claim: Claim = claimSystemNotification,
): Promise<boolean> {
  const runKey = scheduledRunKey(args.name, args.now, args.timezone, args.cadence);
  return claim(db, {
    source: `scheduler-run:${args.name}`,
    fingerprint: runKey,
    now: args.now,
    cooldownMs: args.cadence === "daily" ? 36 * 60 * 60 * 1000 : 10 * 60 * 1000,
    metadata: { runKey, cadence: args.cadence },
  });
}
