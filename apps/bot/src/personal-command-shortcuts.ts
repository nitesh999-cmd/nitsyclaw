export interface LocationShortcut {
  city: string;
  expiresHint?: string;
}

export interface FeatureQueueShortcut {
  limit: number;
}

export interface BuildAgentShortcut {
  dryRun: boolean;
}

export interface BugReportShortcut {
  description: string;
}

const CITY_WORDS = "[A-Za-z][A-Za-z .'-]{1,60}";
const NON_LOCATION_WORDS = new Set(["trouble", "pain", "meeting", "call", "debt", "work"]);
const NON_LOCATION_PHRASES = /\b(with|client|customer|work|meeting|call|trouble|problem)\b/i;

function cleanCity(value: string): string | null {
  const city = value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (!city) return null;
  if (NON_LOCATION_WORDS.has(city.toLowerCase())) return null;
  if (NON_LOCATION_PHRASES.test(city)) return null;
  return city;
}

function cleanHint(value?: string): string | undefined {
  const hint = value?.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return hint || undefined;
}

export function parseLocationShortcut(text: string): LocationShortcut | null {
  const trimmed = text.trim();
  const imIn = new RegExp(`^(?:i['’]?m|i am)\\s+in\\s+(${CITY_WORDS}?)(?:\\s+(?:until|till)\\s+(.+))?$`, "i");
  const useForWeather = new RegExp(`^use\\s+(${CITY_WORDS}?)\\s+for\\s+weather(?:\\s+(.+))?$`, "i");
  const backHome = new RegExp(`^back\\s+in\\s+(${CITY_WORDS}?)(?:\\s+now)?$`, "i");

  for (const pattern of [imIn, useForWeather, backHome]) {
    const match = trimmed.match(pattern);
    const city = cleanCity(match?.[1] ?? "");
    if (city) return { city, expiresHint: cleanHint(match?.[2]) };
  }

  return null;
}

export function parseFeatureQueueShortcut(text: string): FeatureQueueShortcut | null {
  const trimmed = text.trim().toLowerCase();
  if (
    trimmed === "feature status" ||
    trimmed === "feature queue" ||
    trimmed === "features" ||
    trimmed === "show feature queue" ||
    trimmed === "show features"
  ) {
    return { limit: 5 };
  }
  return null;
}

export function parseBuildAgentShortcut(text: string): BuildAgentShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (
    trimmed === "run build" ||
    trimmed === "trigger build" ||
    trimmed === "run build agent" ||
    trimmed === "trigger build agent" ||
    trimmed === "start build agent" ||
    trimmed === "process feature queue"
  ) {
    return { dryRun: false };
  }
  if (
    trimmed === "build status" ||
    trimmed === "build agent status" ||
    trimmed === "preview build queue"
  ) {
    return { dryRun: true };
  }
  return null;
}

export function parseBugReportShortcut(text: string): BugReportShortcut | null {
  const match = text.trim().match(/^(?:bug|problem|report\s+bug)\s*:?\s+(.+)$/is);
  const description = match?.[1]?.replace(/\s+/g, " ").trim();
  return description && description.length >= 5 ? { description } : null;
}
