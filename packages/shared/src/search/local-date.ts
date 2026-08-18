// "Today" means the owner's local day, not the server's UTC day.
//
// A turn shortly after local midnight (Melbourne is UTC+10/+11) still sits on
// the previous UTC date, so anything that resolves "today" from UTC reports
// yesterday. The live proof did exactly that: at 02:05 on 29 July AEST it
// answered "today, July 28, 2026".

export interface LocalDateContext {
  /** ISO calendar date in the owner's timezone, e.g. "2026-07-29". */
  isoDate: string;
  /** Human label in the owner's timezone, e.g. "Wednesday, 29 July 2026". */
  label: string;
  timezone: string;
}

const FALLBACK_TIMEZONE = "Australia/Melbourne";

/**
 * Resolve the owner's local calendar date. An unusable timezone falls back to
 * the product default rather than silently reverting to UTC, because UTC is the
 * exact failure this exists to prevent.
 */
export function resolveLocalDateContext(now: Date, timezone?: string): LocalDateContext {
  const zone = safeTimezone(timezone);
  return {
    isoDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    label: new Intl.DateTimeFormat("en-AU", {
      timeZone: zone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    timezone: zone,
  };
}

/** Instruction line pinning "today" for the search and the answer. */
export function formatLocalDateInstruction(context: LocalDateContext): string {
  return (
    `Today's date in the user's timezone (${context.timezone}) is ${context.label} (${context.isoDate}). ` +
    `Treat "today", "tonight" and "current" as that local date, never the UTC date, and never state a different date as today.`
  );
}

function safeTimezone(timezone?: string): string {
  const candidate = timezone?.trim();
  if (!candidate) return FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}
