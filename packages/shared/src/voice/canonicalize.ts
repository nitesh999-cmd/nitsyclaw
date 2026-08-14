import type {
  VoiceEvidenceSpan,
  VoiceResolutionState,
  VoiceTemporalContext,
  VoiceTypedEntity,
} from "./types.js";

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

function validCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function weekdayForCanonicalDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validCalendarDate(year, month, day)) return null;
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? null;
}

function isSydneyDstGap(dateValue: string, timeValue: string): boolean {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateValue);
  const time = /^(\d{2}):(\d{2})$/u.exec(timeValue);
  if (!date || !time || date[2] !== "10" || time[1] !== "02") return false;
  const year = Number(date[1]);
  const day = Number(date[3]);
  const firstSunday = 1 + ((7 - new Date(Date.UTC(year, 9, 1)).getUTCDay()) % 7);
  return day === firstSunday;
}

function evidence(text: string, start: number, end: number): VoiceEvidenceSpan {
  return { start, end, text: text.slice(start, end) };
}

function entity(
  text: string,
  id: string,
  fieldType: VoiceTypedEntity["fieldType"],
  start: number,
  end: number,
  canonicalValue: string | null,
  resolution: VoiceResolutionState,
): VoiceTypedEntity {
  const span = evidence(text, start, end);
  return {
    id,
    fieldType,
    raw: span.text,
    span,
    canonicalValue,
    resolution,
    source: "deterministic",
  };
}

function decimal(value: string): string {
  const clean = value.replace(/,/gu, "");
  const [whole = "0", fraction] = clean.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "") || "0";
  return fraction === undefined ? normalizedWhole : `${normalizedWhole}.${fraction.replace(/0+$/u, "") || "0"}`;
}

function timeCanonical(hourText: string, minuteText: string, meridiem?: string): string | null {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const lower = meridiem.toLowerCase();
    if (lower.startsWith("p") && hour !== 12) hour += 12;
    if (lower.startsWith("a") && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const HOUR_WORDS = new Map<string, number>([
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10], ["eleven", 11],
  ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15],
  ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19],
  ["twenty", 20], ["twenty-one", 21], ["twenty-two", 22], ["twenty-three", 23],
]);

export function normalizeVoiceView(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function extractDeterministicVoiceEntities(
  text: string,
  locale?: "en-AU" | "en-IN" | "hi-IN",
  temporalContext?: VoiceTemporalContext,
): VoiceTypedEntity[] {
  const entities: VoiceTypedEntity[] = [];
  let sequence = 0;
  const nextId = (field: string) => `${field}-${++sequence}`;

  const meridiemTime = /\b(\d{1,2})[:.](\d{2})\s*([ap])\.?\s*m\.?(?![\p{L}\p{N}])/giu;
  const occupiedTimeSpans: Array<[number, number]> = [];
  for (const match of text.matchAll(meridiemTime)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const canonical = timeCanonical(match[1]!, match[2]!, match[3]);
    if (!canonical) continue;
    occupiedTimeSpans.push([start, end]);
    entities.push(entity(text, nextId("time"), "time", start, end, canonical, "exact"));
  }
  for (const match of text.matchAll(/\b(\d{1,2}):(\d{2})(?!\s*[ap]\.?\s*m\.?)(?!\d)/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (occupiedTimeSpans.some(([left, right]) => start >= left && end <= right)) continue;
    const canonical = timeCanonical(match[1]!, match[2]!);
    if (canonical) entities.push(entity(text, nextId("time"), "time", start, end, canonical, "exact"));
  }
  for (const match of text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:-(?:one|two|three))?)\s+hundred\b/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const hour = HOUR_WORDS.get(match[1]!.toLowerCase());
    if (hour !== undefined) entities.push(entity(text, nextId("time"), "time", start, end, `${String(hour).padStart(2, "0")}:00`, "exact"));
  }

  const powerPattern = /\b(\d+(?:\.\d+)?)\s*(kilowatt(?:[ -]?hours?|s)?|kwh|kw)(?![\p{L}\p{N}])/giu;
  for (const match of text.matchAll(powerPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const unitText = match[2]!.toLowerCase().replace(/[ -]/gu, "");
    const isEnergy = unitText === "kwh" || unitText.startsWith("kilowatthour");
    const unit = isEnergy ? "kWh" : "kW";
    entities.push(entity(
      text,
      nextId(isEnergy ? "energy" : "power"),
      isEnergy ? "energy" : "power",
      start,
      end,
      `${decimal(match[1]!)}|${unit}`,
      "exact",
    ));
  }

  const percentagePattern = /(?<![\p{L}\p{N}])(\d+(?:\.\d+)?)\s*(%|percent(?:age)?|प्रतिशत|परसेंट)(?![\p{L}\p{N}])/giu;
  for (const match of text.matchAll(percentagePattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const surface = match[2]!.toLowerCase();
    const resolution: VoiceResolutionState = surface === "परसेंट" ? "candidate" : "exact";
    entities.push(entity(text, nextId("percentage"), "percentage", start, end, decimal(match[1]!), resolution));
  }

  const amountPattern = /(?:(AUD|INR)\s*)?([$₹])\s*(-?\d[\d,]*(?:\.\d{1,2})?)|\b(AUD|INR)\s+(-?\d[\d,]*(?:\.\d{1,2})?)/giu;
  for (const match of text.matchAll(amountPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const currency = (match[1] ?? match[4] ?? (match[2] === "₹" ? "INR" : "AUD")).toUpperCase();
    const value = decimal(match[3] ?? match[5]!);
    entities.push(entity(text, nextId("amount"), "amount", start, end, `${currency}|${value}`, "exact"));
  }
  const spokenAmountPattern = /(?<![\p{L}\p{N}])(?:(minus|negative)\s+)?(\d[\d,]*(?:\.\d{1,2})?)\s+(dollars?|डॉलर)(?![\p{L}\p{N}])/giu;
  for (const match of text.matchAll(spokenAmountPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const sign = match[1] ? "-" : "";
    entities.push(entity(text, nextId("amount"), "amount", start, end, `AUD|${sign}${decimal(match[2]!)}`, "exact"));
  }

  const numericDatePattern = /(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/gu;
  for (const match of text.matchAll(numericDatePattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const canonical = locale && validCalendarDate(year, month, day)
      ? `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : null;
    entities.push(entity(text, nextId("date"), "date", start, end, canonical, canonical ? "exact" : "ambiguous"));
  }

  for (const match of text.matchAll(/\b(?:tomorrow|today)\b|कल/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const lower = match[0].toLowerCase();
    const canonical = lower === "tomorrow" ? "RELATIVE|tomorrow" : lower === "today" ? "RELATIVE|today" : null;
    entities.push(entity(text, nextId("date"), "date", start, end, canonical, canonical ? "exact" : "ambiguous"));
  }

  for (const match of text.matchAll(/\b(?:Sydney|Melbourne)\b|सिडनी/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    entities.push(entity(text, nextId("location"), "location", start, end, null, "candidate"));
  }

  for (const match of text.matchAll(/\b(?:Australia\/(?:Sydney|Melbourne|Brisbane|Perth|Adelaide)|Asia\/Kolkata|UTC)\b/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const canonical = match[0].toLowerCase() === "utc"
      ? "UTC"
      : match[0].replace(/^australia/iu, "Australia").replace(/^asia/iu, "Asia");
    entities.push(entity(text, nextId("timezone"), "timezone", start, end, canonical, "exact"));
  }

  for (const match of text.matchAll(/(?:\+?\d[\d ()-]{6,}\d)/gu)) {
    const digits = match[0].replace(/\D/gu, "");
    if (digits.length < 8 || digits.length > 15) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    entities.push(entity(text, nextId("phone"), "phone", start, end, match[0].trim().startsWith("+") ? `+${digits}` : digits, "exact"));
  }

  const explicitDate = entities.find(
    ({ fieldType, canonicalValue }) => fieldType === "date" && /^\d{4}-\d{2}-\d{2}$/u.test(canonicalValue ?? ""),
  );
  const contextIsStale = temporalContext !== undefined
    && temporalContext.version !== temporalContext.currentVersion;
  for (const match of text.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/giu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const normalizedWeekday = match[0].toLowerCase();
    let canonical: string | null = `WEEKDAY|${normalizedWeekday}`;
    let resolution: VoiceResolutionState = "ambiguous";
    if (contextIsStale) {
      canonical = null;
      resolution = "rejected";
    } else if (explicitDate?.canonicalValue) {
      if (weekdayForCanonicalDate(explicitDate.canonicalValue) === normalizedWeekday) {
        resolution = "exact";
      } else {
        canonical = null;
        resolution = "rejected";
      }
    } else if (temporalContext) {
      resolution = "exact";
    }
    entities.push(entity(text, nextId("weekday"), "date", start, end, canonical, resolution));
  }

  // Declaring a local time nonexistent is a calendar judgement, and calendar
  // rules are version-dependent. A timezone *spoken in the transcript* is
  // untrusted voice content and must never grant that authority on its own —
  // otherwise the speaker chooses which clock the verifier reasons in. Only an
  // owner-supplied temporal context, on the current calendar version, can.
  // Without one the time is still canonicalized normally and the action is
  // still tiered and blocked; it is simply not asserted to be nonexistent.
  const sydneyCalendarAuthority = temporalContext !== undefined
    && !contextIsStale
    && temporalContext.timezone === "Australia/Sydney";
  if (sydneyCalendarAuthority && explicitDate?.canonicalValue) {
    for (const time of entities.filter(({ fieldType }) => fieldType === "time")) {
      if (time.canonicalValue && isSydneyDstGap(explicitDate.canonicalValue, time.canonicalValue)) {
        time.resolution = "rejected";
      }
    }
  }

  return entities;
}
