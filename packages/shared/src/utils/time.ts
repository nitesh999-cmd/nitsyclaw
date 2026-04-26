import { addDays, addHours, addMinutes, parse, set, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Parse a natural-language relative time like "tomorrow 7am", "in 2 hours", "next monday 9".
 * Returns null when nothing parses — caller falls back to LLM-driven parsing.
 *
 * Rules supported deterministically:
 *   - "in N (minutes|hours|days)"
 *   - "today HH(:MM)?(am|pm)?"
 *   - "tomorrow HH(:MM)?(am|pm)?"
 *   - bare "HH(:MM)?(am|pm)?"  (next occurrence today, else tomorrow)
 *   - "every (monday|tuesday|...) HH(:MM)?(am|pm)?"  (returns first occurrence, caller sets RRULE)
 */
export function parseRelativeTime(
  text: string,
  now: Date,
  timezone: string,
): { fireAt: Date; recurring: boolean } | null {
  const lower = text.toLowerCase().trim();

  // "in N (min|minutes|hr|hrs|hour|hours|day|days)"
  const inMatch = lower.match(/\bin\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|days?)\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1]!, 10);
    const unit = inMatch[2]!;
    if (unit.startsWith("min")) return { fireAt: addMinutes(now, n), recurring: false };
    if (unit.startsWith("h")) return { fireAt: addHours(now, n), recurring: false };
    if (unit.startsWith("d")) return { fireAt: addDays(now, n), recurring: false };
  }

  // "today" / "tomorrow" / weekday + optional time
  const todayMatch = lower.match(/\btoday\b(?:\s+at\s+|\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const tomorrowMatch = lower.match(/\btomorrow\b(?:\s+at\s+|\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const everyMatch = lower.match(
    /\bevery\s+(mon|tue|wed|thu|fri|sat|sun)\w*\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/,
  );
  const bareTime = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);

  function buildAt(base: Date, h: number, m: number, ampm?: string): Date {
    let hour = h;
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const local = set(toZonedTime(base, timezone), { hours: hour, minutes: m, seconds: 0, milliseconds: 0 });
    return fromZonedTime(local, timezone);
  }

  if (todayMatch) {
    const fireAt = buildAt(now, parseInt(todayMatch[1]!, 10), parseInt(todayMatch[2] ?? "0", 10), todayMatch[3]);
    return { fireAt, recurring: false };
  }
  if (tomorrowMatch) {
    const fireAt = buildAt(addDays(now, 1), parseInt(tomorrowMatch[1]!, 10), parseInt(tomorrowMatch[2] ?? "0", 10), tomorrowMatch[3]);
    return { fireAt, recurring: false };
  }
  if (everyMatch) {
    // First occurrence is the next matching weekday; RRULE built by caller.
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const target = dayMap[everyMatch[1]!.slice(0, 3)]!;
    const local = toZonedTime(now, timezone);
    let delta = (target - local.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // skip today; first occurrence is next week
    const fireAt = buildAt(addDays(now, delta), parseInt(everyMatch[2]!, 10), parseInt(everyMatch[3] ?? "0", 10), everyMatch[4]);
    return { fireAt, recurring: true };
  }
  if (bareTime) {
    let candidate = buildAt(now, parseInt(bareTime[1]!, 10), parseInt(bareTime[2] ?? "0", 10), bareTime[3]);
    if (candidate <= now) candidate = addDays(candidate, 1);
    return { fireAt: candidate, recurring: false };
  }

  return null;
}

export function formatBriefDate(d: Date, timezone: string): string {
  const z = toZonedTime(d, timezone);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

export function isInQuietHours(now: Date, timezone: string, startHHMM: string, endHHMM: string): boolean {
  const z = toZonedTime(now, timezone);
  const minutes = z.getHours() * 60 + z.getMinutes();
  const [sh, sm] = startHHMM.split(":").map((s) => parseInt(s, 10)) as [number, number];
  const [eh, em] = endHHMM.split(":").map((s) => parseInt(s, 10)) as [number, number];
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  // overnight window (e.g. 22:00 → 07:00)
  return minutes >= start || minutes < end;
}

// re-export commonly used date helpers
export { startOfDay, addDays, addMinutes, addHours, parse };
