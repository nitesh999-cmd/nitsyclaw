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

export type HomeAssistantShortcutKind =
  | "sort-actions"
  | "clean-note"
  | "draft-reply"
  | "compare-options"
  | "call-script"
  | "renewal-watch"
  | "complaint"
  | "check-message"
  | "travel-day"
  | "triage-admin";

export interface HomeAssistantShortcut {
  kind: HomeAssistantShortcutKind;
  text: string;
  parts: string[];
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

const HOME_SHORTCUTS: Array<{ kind: HomeAssistantShortcutKind; pattern: RegExp }> = [
  { kind: "sort-actions", pattern: /^(?:next\s+steps|find\s+my\s+next\s+steps)\s*:\s+(.+)$/is },
  { kind: "clean-note", pattern: /^(?:tidy\s+note|clean\s+note|make\s+this\s+note\s+tidy)\s*:\s+(.+)$/is },
  { kind: "draft-reply", pattern: /^(?:reply\s+draft|help\s+me\s+reply|draft\s+reply)\s*:\s+(.+)$/is },
  { kind: "compare-options", pattern: /^(?:choose|compare|choose\s+between\s+options)\s*:\s+(.+)$/is },
  { kind: "call-script", pattern: /^(?:call\s+script|prepare\s+a\s+call|prepare\s+call)\s*:\s+(.+)$/is },
  { kind: "renewal-watch", pattern: /^(?:renewal\s+watch|check\s+renewals|renewals)\s*:\s+(.+)$/is },
  { kind: "complaint", pattern: /^(?:complaint|firm\s+complaint|write\s+a\s+firm\s+complaint)\s*:\s+(.+)$/is },
  { kind: "check-message", pattern: /^(?:check\s+before\s+send|check\s+before\s+i\s+send|message\s+check)\s*:\s+(.+)$/is },
  { kind: "travel-day", pattern: /^(?:travel\s+day|plan\s+travel\s+day)\s*:\s+(.+)$/is },
  { kind: "triage-admin", pattern: /^(?:sort\s+admin|sort\s+life\s+admin|triage\s+admin)\s*:\s+(.+)$/is },
];

export function parseHomeAssistantShortcut(text: string): HomeAssistantShortcut | null {
  const trimmed = text.trim();
  for (const shortcut of HOME_SHORTCUTS) {
    const match = trimmed.match(shortcut.pattern);
    const raw = match?.[1]?.replace(/\s+/g, " ").trim();
    if (!raw || raw.length < 3) continue;
    return {
      kind: shortcut.kind,
      text: raw,
      parts: raw
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean),
    };
  }
  return null;
}
