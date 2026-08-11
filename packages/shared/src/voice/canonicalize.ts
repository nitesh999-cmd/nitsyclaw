import type {
  VoiceEvidenceSpan,
  VoiceResolutionState,
  VoiceTypedEntity,
} from "./types.js";

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

export function normalizeVoiceView(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function extractDeterministicVoiceEntities(
  text: string,
  locale?: "en-AU" | "en-IN" | "hi-IN",
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

  const numericDatePattern = /(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/gu;
  for (const match of text.matchAll(numericDatePattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const canonical = locale && day >= 1 && day <= 31 && month >= 1 && month <= 12
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

  for (const match of text.matchAll(/(?:\+?\d[\d ()-]{6,}\d)/gu)) {
    const digits = match[0].replace(/\D/gu, "");
    if (digits.length < 8 || digits.length > 15) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    entities.push(entity(text, nextId("phone"), "phone", start, end, match[0].trim().startsWith("+") ? `+${digits}` : digits, "exact"));
  }

  return entities;
}
