export interface LocationShortcut {
  city: string;
  expiresHint?: string;
}

export interface LocationStatusShortcut {
  kind: "location-status";
}

export interface FeatureQueueShortcut {
  limit: number;
}

export interface BuildAgentShortcut {
  dryRun: boolean;
}

export interface HelpShortcut {
  kind: "help";
}

export interface CapabilityStatusShortcut {
  kind: "capability-status";
}

export interface CommandContractShortcut {
  kind: "command-contract";
}

export interface WhatsAppSelfTestShortcut {
  kind: "whatsapp-self-test";
}

export interface WhatsAppIncidentSummaryShortcut {
  kind: "whatsapp-incident-summary";
}

export interface WhatsAppCanaryShortcut {
  kind: "whatsapp-canary";
  detail: boolean;
}

export interface QueuedIntegrationShortcut {
  toolName:
    | "queue_email_connection_request"
    | "queue_storage_file_import_request"
    | "queue_google_photos_import_request"
    | "prepare_sms_draft"
    | "queue_phone_call_request"
    | "queue_bank_csv_import_request"
    | "queue_birthday_import_request"
    | "queue_spotify_music_request"
    | "queue_social_video_analysis_request";
  label: string;
  input: Record<string, unknown>;
}

export interface DailyStatusShortcut {
  kind: "daily-status";
}

export interface NightlyHealthShortcut {
  kind: "nightly-health";
}

export type LocalStatusShortcutKind = "all" | "files" | "reminders" | "expenses" | "summaries";

export interface LocalStatusShortcut {
  kind: LocalStatusShortcutKind;
}

export interface AutonomousWorkShortcut {
  kind: "autonomous-work";
}

export interface RepeatLastMessageShortcut {
  preferVoice: boolean;
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
  | "triage-admin"
  | "bill-summary"
  | "return-plan"
  | "subscription-check"
  | "chore-split"
  | "emergency-card"
  | "meal-ideas"
  | "shopping-list"
  | "pack-list"
  | "appointment-prep"
  | "decision-memo"
  | "home-inventory"
  | "maintenance-plan"
  | "gift-ideas"
  | "weekend-plan"
  | "budget-split"
  | "habit-plan"
  | "lost-item"
  | "school-note"
  | "pet-care"
  | "password-reset-plan"
  | "leave-home-checklist"
  | "car-trip-prep"
  | "medicine-list"
  | "symptom-note"
  | "bill-dispute"
  | "guest-prep"
  | "kid-activity"
  | "cleaning-plan"
  | "move-checklist"
  | "warranty-tracker";

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

export function parseLocationStatusShortcut(text: string): LocationStatusShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (
    trimmed === "location status" ||
    trimmed === "weather location" ||
    trimmed === "where am i" ||
    trimmed === "what location are you using" ||
    trimmed === "which city are you using for weather"
  ) {
    return { kind: "location-status" };
  }
  return null;
}

export function parseFeatureQueueShortcut(text: string): FeatureQueueShortcut | null {
  const trimmed = text.trim().toLowerCase();
  if (!mentionsFeatureQueueStatus(trimmed)) return null;
  if (/\b(weather|forecast|rain|temperature)\b/.test(trimmed)) return null;
  return { limit: 5 };
}

export function mentionsFeatureQueueStatus(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (
    trimmed === "feature status" ||
    trimmed === "feature queue" ||
    trimmed === "features" ||
    trimmed === "next moves" ||
    trimmed === "what next" ||
    trimmed === "show feature queue" ||
    trimmed === "show features" ||
    /\bwhat\s+should\s+we\s+build\s+next\b/.test(trimmed) ||
    /\bnext\s+(?:build|deploy|move|moves)\b/.test(trimmed) ||
    /\b(pending|queued|awaiting|left)\s+(features?|bugs?|items?)\b/.test(trimmed) ||
    /\b(features?|bugs?|items?)\s+(pending|queued|awaiting|left)\b/.test(trimmed) ||
    /\bwhat(?:'s| is)\s+(?:still\s+)?(?:pending|queued|left)\b/.test(trimmed)
  ) {
    return true;
  }
  return false;
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

export function parseHelpShortcut(text: string): HelpShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "help" ||
    trimmed === "commands" ||
    trimmed === "what can you do" ||
    trimmed === "what works" ||
    trimmed === "what can nitsyclaw do" ||
    trimmed === "how do i use this" ||
    trimmed === "show me what works"
  ) {
    return { kind: "help" };
  }
  return null;
}

export function parseCapabilityStatusShortcut(text: string): CapabilityStatusShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "status" ||
    trimmed === "nitsyclaw status" ||
    trimmed === "feature matrix" ||
    trimmed === "ready features" ||
    trimmed === "what is ready" ||
    trimmed === "what's ready" ||
    trimmed === "what is ready and pending" ||
    trimmed === "pending items" ||
    trimmed === "pending features" ||
    trimmed === "needs setup" ||
    trimmed === "what needs setup" ||
    trimmed === "ready pending setup" ||
    trimmed === "show ready pending setup" ||
    trimmed === "capability map" ||
    trimmed === "capabilities map" ||
    trimmed === "what works and what needs setup"
  ) {
    return { kind: "capability-status" };
  }
  return null;
}

export function parseCommandContractShortcut(text: string): CommandContractShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "command contract" ||
    trimmed === "whatsapp command contract" ||
    trimmed === "how do you handle commands" ||
    trimmed === "what happens when a command fails" ||
    trimmed === "what happens if a command fails" ||
    trimmed === "explain command outcomes"
  ) {
    return { kind: "command-contract" };
  }
  return null;
}

export function parseWhatsAppSelfTestShortcut(text: string): WhatsAppSelfTestShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "self test" ||
    trimmed === "self-test" ||
    trimmed === "whatsapp self test" ||
    trimmed === "whatsapp self-test" ||
    trimmed === "bot self test" ||
    trimmed === "bot health" ||
    trimmed === "whatsapp health" ||
    trimmed === "diagnose whatsapp" ||
    trimmed === "test whatsapp"
  ) {
    return { kind: "whatsapp-self-test" };
  }
  return null;
}

export function parseWhatsAppIncidentSummaryShortcut(text: string): WhatsAppIncidentSummaryShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "what went wrong" ||
    trimmed === "why did it fail" ||
    trimmed === "recent failures" ||
    trimmed === "failure summary" ||
    trimmed === "incident summary" ||
    trimmed === "whatsapp incidents" ||
    trimmed === "whatsapp failures" ||
    trimmed === "what broke" ||
    trimmed === "show incidents"
  ) {
    return { kind: "whatsapp-incident-summary" };
  }
  return null;
}

export function parseWhatsAppCanaryShortcut(text: string): WhatsAppCanaryShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "canary test" ||
    trimmed === "whatsapp canary" ||
    trimmed === "run canary" ||
    trimmed === "proof test" ||
    trimmed === "whatsapp proof" ||
    trimmed === "live proof" ||
    trimmed === "delivery test" ||
    trimmed === "test delivery"
  ) {
    return { kind: "whatsapp-canary", detail: false };
  }
  if (
    trimmed === "proof details" ||
    trimmed === "whatsapp proof details" ||
    trimmed === "canary details" ||
    trimmed === "whatsapp canary details"
  ) {
    return { kind: "whatsapp-canary", detail: true };
  }
  return null;
}

export function parseQueuedIntegrationShortcut(text: string): QueuedIntegrationShortcut | null {
  const raw = text.trim().replace(/\s+/g, " ");
  const trimmed = raw.toLowerCase().replace(/[.!?]+$/g, "");
  if (trimmed.length < 4) return null;

  const smsDraft = raw.match(/^(?:draft|prepare|write)\s+(?:an?\s+)?(?:sms|text)\s+to\s+(.+?)\s+saying\s+(.+)$/i);
  if (smsDraft) {
    const recipient = smsDraft[1]?.trim();
    const body = smsDraft[2]?.trim();
    if (!recipient || !body) return null;
    return {
      toolName: "prepare_sms_draft",
      label: "SMS draft",
      input: {
        recipient,
        body,
        purpose: "WhatsApp requested SMS draft",
      },
    };
  }

  if (!/\b(connect|setup|set up|enable|add|import|sync|analyse|analyze|queue|can you|access|browse|search|create|make)\b/.test(trimmed)) {
    return null;
  }

  if (/\b(gmail|outlook|email|mailbox|mail)\b/.test(trimmed)) {
    const provider = /\bgmail\b/.test(trimmed) && /\boutlook\b/.test(trimmed)
      ? "both"
      : /\boutlook\b/.test(trimmed)
        ? "outlook"
        : /\bgmail\b/.test(trimmed)
          ? "gmail"
          : "both";
    const requestedCapability = /\bsend\b/.test(trimmed)
      ? "send_after_approval"
      : /\bdraft|reply\b/.test(trimmed)
        ? "draft"
        : /\bsearch|find\b/.test(trimmed)
          ? "search"
          : "read";
    return {
      toolName: "queue_email_connection_request",
      label: "Email",
      input: { provider, requestedCapability, goal: raw },
    };
  }

  if (/\b(google drive|drive|onedrive|one drive|file|files|document|documents)\b/.test(trimmed)) {
    const provider = /\b(one\s*drive|onedrive)\b/.test(trimmed) ? "onedrive" : "google_drive";
    return {
      toolName: "queue_storage_file_import_request",
      label: provider === "onedrive" ? "OneDrive" : "Google Drive",
      input: { provider, goal: raw },
    };
  }

  if (/\b(google photos|photos|photo|album|albums|pictures)\b/.test(trimmed)) {
    return {
      toolName: "queue_google_photos_import_request",
      label: "Google Photos",
      input: { mediaHint: raw, goal: raw },
    };
  }

  if (/\b(spotify|playlist|music|songs?|suggested playlist)\b/.test(trimmed)) {
    return {
      toolName: "queue_spotify_music_request",
      label: "Spotify",
      input: { goal: raw },
    };
  }

  if (/\b(bank|banking|bank feed|bank feeds|transaction|transactions|statement|card feed|card feeds)\b/.test(trimmed)) {
    return {
      toolName: "queue_bank_csv_import_request",
      label: "Bank feeds",
      input: { goal: raw },
    };
  }

  if (/\b(facebook birthday|facebook birthdays|fb birthday|fb birthdays|birthdays?|birthday messages?)\b/.test(trimmed)) {
    return {
      toolName: "queue_birthday_import_request",
      label: "Birthdays",
      input: { source: "manual", goal: raw },
    };
  }

  if (/\b(phone call|phone calls|call logs?|sms logs?|text logs?|phone logs?)\b/.test(trimmed)) {
    return {
      toolName: "queue_phone_call_request",
      label: "Phone calls",
      input: { contact: "not specified", purpose: raw },
    };
  }

  if (/\b(sms|text message|send text|phone\/sms)\b/.test(trimmed)) {
    return {
      toolName: "queue_phone_call_request",
      label: "Phone/SMS",
      input: { contact: "not specified", purpose: raw },
    };
  }

  if (/\b(instagram|youtube|facebook|tiktok|reel|shorts?|social video|video analysis)\b/.test(trimmed)) {
    const platform = /\byoutube|shorts?\b/.test(trimmed)
      ? "youtube"
      : /\binstagram|reel\b/.test(trimmed)
        ? "instagram"
        : /\bfacebook\b/.test(trimmed)
          ? "facebook"
          : /\btiktok\b/.test(trimmed)
            ? "tiktok"
            : "other";
    return {
      toolName: "queue_social_video_analysis_request",
      label: "Social video analysis",
      input: { platform, urlOrUploadHint: raw, goal: raw },
    };
  }

  return null;
}

export function parseDailyStatusShortcut(text: string): DailyStatusShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "daily status" ||
    trimmed === "today status" ||
    trimmed === "today summary" ||
    trimmed === "daily summary" ||
    trimmed === "morning status" ||
    trimmed === "morning brief" ||
    trimmed === "what is my day" ||
    trimmed === "what's my day"
  ) {
    return { kind: "daily-status" };
  }
  return null;
}

export function parseNightlyHealthShortcut(text: string): NightlyHealthShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "nightly health now" ||
    trimmed === "whatsapp health now" ||
    trimmed === "health report now" ||
    trimmed === "send health report now"
  ) {
    return { kind: "nightly-health" };
  }
  return null;
}

export function parseLocalStatusShortcut(text: string): LocalStatusShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (trimmed === "local status" || trimmed === "local features" || trimmed === "safe local features") {
    return { kind: "all" };
  }
  if (
    trimmed === "file status" ||
    trimmed === "files" ||
    trimmed === "documents" ||
    trimmed === "document status" ||
    trimmed === "what files can you read"
  ) {
    return { kind: "files" };
  }
  if (
    trimmed === "reminders" ||
    trimmed === "reminder status" ||
    trimmed === "pending reminders" ||
    trimmed === "what reminders do i have"
  ) {
    return { kind: "reminders" };
  }
  if (
    trimmed === "expenses" ||
    trimmed === "expense summary" ||
    trimmed === "spending summary" ||
    trimmed === "this month spending"
  ) {
    return { kind: "expenses" };
  }
  if (
    trimmed === "summaries" ||
    trimmed === "summary commands" ||
    trimmed === "what can you summarize" ||
    trimmed === "what can you summarise"
  ) {
    return { kind: "summaries" };
  }
  return null;
}

export function parseAutonomousWorkShortcut(text: string): AutonomousWorkShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (
    trimmed === "what can you do without me" ||
    trimmed === "what else can you do without me" ||
    trimmed === "what can you do without my involvement" ||
    trimmed === "what can you do while i am away" ||
    trimmed === "what can you do on your own" ||
    trimmed === "without me" ||
    trimmed === "minimal effort" ||
    trimmed === "what needs me" ||
    trimmed === "what needs my involvement" ||
    trimmed === "what needs setup from me"
  ) {
    return { kind: "autonomous-work" };
  }
  return null;
}

export function parseRepeatLastMessageShortcut(text: string): RepeatLastMessageShortcut | null {
  const trimmed = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (
    /^(?:hear|play|listen to)\s+(?:my\s+)?(?:last\s+)?(?:voice\s+)?message$/.test(trimmed) ||
    /^(?:hear|play|listen to)\s+it$/.test(trimmed)
  ) {
    return { preferVoice: true };
  }
  if (
    /^(?:read|repeat|show)\s+(?:my\s+)?last\s+message$/.test(trimmed) ||
    /^what\s+did\s+i\s+just\s+say$/.test(trimmed) ||
    /^what\s+was\s+my\s+last\s+message$/.test(trimmed) ||
    /^(?:say|show|repeat)\s+that\s+again$/.test(trimmed)
  ) {
    return { preferVoice: false };
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
  { kind: "bill-summary", pattern: /^(?:bill\s+summary|summarise\s+bill|summarize\s+bill)\s*:\s+(.+)$/is },
  { kind: "return-plan", pattern: /^(?:return\s+plan|warranty\s+plan|refund\s+plan)\s*:\s+(.+)$/is },
  { kind: "subscription-check", pattern: /^(?:subscription\s+check|subscriptions|check\s+subscriptions)\s*:\s+(.+)$/is },
  { kind: "chore-split", pattern: /^(?:chore\s+split|split\s+chores|house\s+jobs)\s*:\s+(.+)$/is },
  { kind: "emergency-card", pattern: /^(?:emergency\s+card|emergency\s+info|medical\s+card)\s*:\s+(.+)$/is },
  { kind: "meal-ideas", pattern: /^(?:meal\s+ideas|what\s+can\s+i\s+cook|cook\s+with)\s*:\s+(.+)$/is },
  { kind: "shopping-list", pattern: /^(?:shopping\s+list|sort\s+shopping|groceries)\s*:\s+(.+)$/is },
  { kind: "pack-list", pattern: /^(?:pack\s+list|packing\s+list|what\s+to\s+pack)\s*:\s+(.+)$/is },
  { kind: "appointment-prep", pattern: /^(?:appointment\s+prep|prep\s+appointment|doctor\s+prep)\s*:\s+(.+)$/is },
  { kind: "decision-memo", pattern: /^(?:decision\s+memo|help\s+me\s+decide|decision\s+note)\s*:\s+(.+)$/is },
  { kind: "home-inventory", pattern: /^(?:home\s+inventory|inventory|where\s+is\s+this)\s*:\s+(.+)$/is },
  { kind: "maintenance-plan", pattern: /^(?:maintenance\s+plan|home\s+maintenance|fix\s+plan)\s*:\s+(.+)$/is },
  { kind: "gift-ideas", pattern: /^(?:gift\s+ideas|gift\s+plan|present\s+ideas)\s*:\s+(.+)$/is },
  { kind: "weekend-plan", pattern: /^(?:weekend\s+plan|plan\s+weekend|family\s+weekend)\s*:\s+(.+)$/is },
  { kind: "budget-split", pattern: /^(?:budget\s+split|split\s+cost|split\s+bill)\s*:\s+(.+)$/is },
  { kind: "habit-plan", pattern: /^(?:habit\s+plan|build\s+habit|tiny\s+habit)\s*:\s+(.+)$/is },
  { kind: "lost-item", pattern: /^(?:lost\s+item|find\s+lost|find\s+my)\s*:\s+(.+)$/is },
  { kind: "school-note", pattern: /^(?:school\s+note|absence\s+note|sick\s+note)\s*:\s+(.+)$/is },
  { kind: "pet-care", pattern: /^(?:pet\s+care|pet\s+plan|animal\s+care)\s*:\s+(.+)$/is },
  { kind: "password-reset-plan", pattern: /^(?:password\s+reset\s+plan|reset\s+password\s+plan|account\s+recovery\s+plan)\s*:\s+(.+)$/is },
  { kind: "leave-home-checklist", pattern: /^(?:leave\s+home\s+checklist|leaving\s+home|house\s+exit\s+check)\s*:\s+(.+)$/is },
  { kind: "car-trip-prep", pattern: /^(?:car\s+trip\s+prep|road\s+trip\s+prep|drive\s+prep)\s*:\s+(.+)$/is },
  { kind: "medicine-list", pattern: /^(?:medicine\s+list|medication\s+list|meds\s+list)\s*:\s+(.+)$/is },
  { kind: "symptom-note", pattern: /^(?:symptom\s+note|doctor\s+note\s+prep|health\s+note)\s*:\s+(.+)$/is },
  { kind: "bill-dispute", pattern: /^(?:bill\s+dispute|dispute\s+bill|challenge\s+bill)\s*:\s+(.+)$/is },
  { kind: "guest-prep", pattern: /^(?:guest\s+prep|visitor\s+prep|guests\s+coming)\s*:\s+(.+)$/is },
  { kind: "kid-activity", pattern: /^(?:kid\s+activity|kids\s+activity|child\s+activity)\s*:\s+(.+)$/is },
  { kind: "cleaning-plan", pattern: /^(?:cleaning\s+plan|cleaning\s+sprint|tidy\s+room)\s*:\s+(.+)$/is },
  { kind: "move-checklist", pattern: /^(?:move\s+checklist|moving\s+checklist|house\s+move)\s*:\s+(.+)$/is },
  { kind: "warranty-tracker", pattern: /^(?:warranty\s+tracker|track\s+warranty|warranty\s+note)\s*:\s+(.+)$/is },
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
