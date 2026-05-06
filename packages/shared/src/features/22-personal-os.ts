// Feature 22: Batch 1 Personal OS tools.
// These tools make NitsyClaw more useful for normal home use without granting
// new external permissions or performing irreversible actions.

import { z } from "zod";
import type { ToolRegistry } from "../agent/tools.js";

type RiskLevel = "low" | "medium" | "high";
type MemorySensitivity = "normal" | "personal" | "sensitive";

export interface FirstDayWizardInput {
  homeLocation?: string;
  timezone?: string;
  routine?: string;
  people?: string[];
  jobs?: string[];
}

export interface TravelAwareModeInput {
  city: string;
  region?: string;
  country?: string;
  timezone?: string;
  starts?: string;
  ends?: string;
  reason?: string;
}

export interface PeopleMemoryCardInput {
  name: string;
  relationship?: string;
  birthday?: string;
  preferredChannel?: string;
  lastInteraction?: string;
  followUp?: string;
}

export interface WaitingOnTrackerInput {
  text: string;
  defaultCadence?: string;
}

export interface CapabilityBoundaryInput {
  area?: "email" | "files" | "photos" | "phone" | "banking" | "social" | "all";
}

export interface RiskLabelInput {
  action: string;
  touches?: string[];
  sendsExternally?: boolean;
  deletesData?: boolean;
  readsPrivateData?: boolean;
  moneyOrLegal?: boolean;
}

export interface ConsentReceiptInput {
  permission: string;
  accountOrProvider?: string;
  scope?: string;
  reason?: string;
  expires?: string;
  grantedAt?: string;
}

export interface PrivateModePlanInput {
  surface: "dashboard" | "whatsapp";
  reason?: string;
  duration?: string;
}

export interface MemoryReviewInput {
  fact: string;
  source?: string;
  sensitivity?: MemorySensitivity;
  expiry?: string;
}

export function createFirstDayWizard(input: FirstDayWizardInput): {
  title: string;
  captured: Record<string, string | string[]>;
  questions: string[];
  firstThreeJobs: string[];
  setupChecklist: string[];
} {
  const jobs = cleanList(input.jobs).slice(0, 3);
  return {
    title: "First-day setup",
    captured: {
      homeLocation: cleanText(input.homeLocation) || "not set",
      timezone: cleanText(input.timezone) || "not set",
      routine: cleanText(input.routine) || "not set",
      people: cleanList(input.people),
    },
    questions: [
      "Where do you live most of the time?",
      "What should I remember about your normal day?",
      "Who are the important people I should know about?",
      "What are the first three jobs you want off your mind?",
    ],
    firstThreeJobs: jobs.length ? jobs : ["capture reminders", "remember important facts", "help draft replies"],
    setupChecklist: [
      "Confirm home location and timezone.",
      "Save important people only with clear consent.",
      "Pick three starter jobs and keep the rest in the queue.",
      "Keep integrations read-only until trust is proven.",
    ],
  };
}

export function planTravelAwareMode(input: TravelAwareModeInput): {
  mode: "travel";
  currentLocation: string;
  timezone: string;
  activeWindow: string;
  safeguards: string[];
  weatherInstruction: string;
} {
  const currentLocation = [input.city, input.region, input.country].map(cleanText).filter(Boolean).join(", ");
  return {
    mode: "travel",
    currentLocation,
    timezone: cleanText(input.timezone) || "ask before assuming",
    activeWindow: `${cleanText(input.starts) || "now"} to ${cleanText(input.ends) || "until user turns travel mode off"}`,
    safeguards: [
      "Use this location for weather and local plans while travel mode is active.",
      "Do not overwrite home location unless the user explicitly says to save it as home.",
      "Mention the location used in weather replies.",
      "Ask before changing calendar timezone assumptions.",
    ],
    weatherInstruction: `For weather, use ${currentLocation || "the travel city"} while this mode is active.`,
  };
}

export function createPeopleMemoryCard(input: PeopleMemoryCardInput): {
  summary: string;
  fields: Record<string, string>;
  nextAction: string;
  sensitivity: "personal";
} {
  const name = sentenceCase(input.name);
  const followUp = cleanText(input.followUp);
  return {
    summary: `${name}${input.relationship ? ` is ${cleanText(input.relationship)}` : ""}.`,
    fields: {
      name,
      relationship: cleanText(input.relationship) || "unknown",
      birthday: cleanText(input.birthday) || "unknown",
      preferredChannel: cleanText(input.preferredChannel) || "ask before contacting",
      lastInteraction: cleanText(input.lastInteraction) || "unknown",
      followUp: followUp || "none",
    },
    nextAction: followUp ? `Follow up: ${followUp}.` : "No follow-up saved.",
    sensitivity: "personal",
  };
}

export function extractWaitingOnItems(input: WaitingOnTrackerInput): {
  items: Array<{ title: string; dueHint: string; cadence: string; source: string }>;
} {
  const cadence = cleanText(input.defaultCadence) || "check weekly";
  const sentences = splitSentences(input.text);
  const items = sentences
    .filter((sentence) => /\b(waiting|pending|follow up|chase|owed|promised|sent me|reply from)\b/i.test(sentence))
    .map((sentence) => ({
      title: sentenceCase(sentence.replace(/\b(i am|i'm|we are|we're)?\s*waiting (on|for)\s*/i, "Waiting for ")),
      dueHint: extractDueHint(sentence),
      cadence,
      source: compact(sentence, 140),
    }));
  return { items };
}

export function capabilityBoundarySummary(input: CapabilityBoundaryInput = {}): {
  area: string;
  canDoNow: string[];
  needsSetup: string[];
  blocked: string[];
  approvalRequired: string[];
} {
  const area = input.area ?? "all";
  const map = capabilityMap();
  const selected = area === "all" ? Object.values(map) : [map[area]];
  return {
    area,
    canDoNow: selected.flatMap((item) => item.canDoNow),
    needsSetup: selected.flatMap((item) => item.needsSetup),
    blocked: selected.flatMap((item) => item.blocked),
    approvalRequired: selected.flatMap((item) => item.approvalRequired),
  };
}

export function createDataInventoryMap(input: { includeRetention?: boolean } = {}): {
  dataTypes: Array<{ name: string; source: string; encrypted: boolean; retention: string; userControl: string }>;
} {
  const retention = input.includeRetention === false ? "configured policy" : "default 90 days for messages where pruning is enabled";
  return {
    dataTypes: [
      { name: "Messages", source: "WhatsApp and dashboard", encrypted: true, retention, userControl: "export/delete" },
      { name: "Memories", source: "explicit save/pin tools", encrypted: true, retention: "until deleted or expired", userControl: "review/delete" },
      { name: "Reminders", source: "reminder tools", encrypted: true, retention: "until completed/deleted", userControl: "complete/delete" },
      { name: "Expenses", source: "receipt and expense tools", encrypted: true, retention: "until deleted", userControl: "export/delete" },
      { name: "Audit log", source: "tool execution metadata", encrypted: false, retention: "operational history", userControl: "redacted export/delete" },
      { name: "Connected accounts", source: "OAuth/integration setup", encrypted: true, retention: "until disconnected", userControl: "disconnect/delete" },
    ],
  };
}

export function labelActionRisk(input: RiskLabelInput): {
  level: RiskLevel;
  reasons: string[];
  requiredConfirmation: string;
  safeDefault: string;
} {
  const reasons: string[] = [];
  if (input.sendsExternally) reasons.push("sends something outside NitsyClaw");
  if (input.deletesData) reasons.push("deletes or changes stored data");
  if (input.readsPrivateData) reasons.push("reads private personal data");
  if (input.moneyOrLegal) reasons.push("may affect money, legal, or account decisions");
  for (const touch of cleanList(input.touches)) reasons.push(`touches ${touch}`);
  const level: RiskLevel = input.deletesData || input.sendsExternally || input.moneyOrLegal
    ? "high"
    : input.readsPrivateData || reasons.length > 0
      ? "medium"
      : "low";
  return {
    level,
    reasons: reasons.length ? reasons : ["local drafting or planning only"],
    requiredConfirmation: level === "high" ? "explicit yes with action details" : level === "medium" ? "plain yes before proceeding" : "no extra confirmation",
    safeDefault: level === "high" ? "prepare a draft or queue a request instead of acting" : "answer or draft without external action",
  };
}

export function draftConsentReceipt(input: ConsentReceiptInput): {
  summary: string;
  fields: Record<string, string>;
  checks: string[];
} {
  const provider = cleanText(input.accountOrProvider) || "NitsyClaw";
  return {
    summary: `${provider}: permission for ${cleanText(input.permission)}.`,
    fields: {
      permission: cleanText(input.permission),
      provider,
      scope: cleanText(input.scope) || "not specified",
      reason: cleanText(input.reason) || "not specified",
      grantedAt: cleanText(input.grantedAt) || "now",
      expires: cleanText(input.expires) || "until revoked",
    },
    checks: [
      "Show this receipt in the activity log.",
      "Allow revoke/disconnect from settings.",
      "Do not expand scope without a new receipt.",
    ],
  };
}

export function planPrivateMode(input: PrivateModePlanInput): {
  surface: "dashboard" | "whatsapp";
  behavior: string[];
  limitations: string[];
  exitPhrase: string;
} {
  return {
    surface: input.surface,
    behavior: [
      "Answer the current turn without saving the user message or assistant reply.",
      "Do not pin memories from this turn unless the user explicitly says save this.",
      "Do not include this turn in future cross-surface history.",
    ],
    limitations: [
      "Provider/API logs outside the app may still exist.",
      "Actions that change data still need a normal confirmation.",
      cleanText(input.duration) ? `Suggested duration: ${cleanText(input.duration)}.` : "User should turn it off when finished.",
    ],
    exitPhrase: input.surface === "whatsapp" ? "private mode off" : "turn private mode off",
  };
}

export function reviewMemoryCandidate(input: MemoryReviewInput): {
  recommendation: "pin" | "review" | "do_not_save";
  reasons: string[];
  suggestedRecord?: Record<string, string>;
} {
  const fact = cleanText(input.fact);
  const sensitivity = input.sensitivity ?? inferSensitivity(fact);
  const reasons: string[] = [];
  if (!fact) {
    return { recommendation: "do_not_save", reasons: ["No usable fact was provided."] };
  }
  if (sensitivity === "sensitive") reasons.push("Sensitive information should be reviewed before long-term memory.");
  if (/\b(password|card|otp|code|secret|token)\b/i.test(fact)) {
    return { recommendation: "do_not_save", reasons: ["This looks like a secret or credential."] };
  }
  if (input.expiry) reasons.push("Has an expiry date, so it should not become permanent memory.");
  const recommendation = sensitivity === "normal" && !input.expiry ? "pin" : "review";
  return {
    recommendation,
    reasons: reasons.length ? reasons : ["Useful stable preference or fact."],
    suggestedRecord: {
      fact,
      source: cleanText(input.source) || "user message",
      sensitivity,
      expiry: cleanText(input.expiry) || "none",
    },
  };
}

export function registerPersonalOs(registry: ToolRegistry): void {
  registry.register({
    name: "create_first_day_wizard",
    description: "Create a normal-human first-day setup plan for NitsyClaw.",
    inputSchema: z.object({
      homeLocation: z.string().optional(),
      timezone: z.string().optional(),
      routine: z.string().optional(),
      people: z.array(z.string()).optional(),
      jobs: z.array(z.string()).optional(),
    }),
    handler: async (input: FirstDayWizardInput) => createFirstDayWizard(input),
  });

  registry.register({
    name: "plan_travel_aware_mode",
    description: "Prepare temporary travel context without overwriting home location.",
    inputSchema: z.object({
      city: z.string().min(1),
      region: z.string().optional(),
      country: z.string().optional(),
      timezone: z.string().optional(),
      starts: z.string().optional(),
      ends: z.string().optional(),
      reason: z.string().optional(),
    }),
    handler: async (input: TravelAwareModeInput) => planTravelAwareMode(input),
  });

  registry.register({
    name: "create_people_memory_card",
    description: "Create a structured memory card for an important person.",
    inputSchema: z.object({
      name: z.string().min(1),
      relationship: z.string().optional(),
      birthday: z.string().optional(),
      preferredChannel: z.string().optional(),
      lastInteraction: z.string().optional(),
      followUp: z.string().optional(),
    }),
    handler: async (input: PeopleMemoryCardInput) => createPeopleMemoryCard(input),
  });

  registry.register({
    name: "extract_waiting_on_items",
    description: "Extract things the user is waiting on from messy text.",
    inputSchema: z.object({ text: z.string().min(1), defaultCadence: z.string().optional() }),
    handler: async (input: WaitingOnTrackerInput) => extractWaitingOnItems(input),
  });

  registry.register({
    name: "capability_boundary_summary",
    description: "Explain what NitsyClaw can do now, what needs setup, and what is blocked.",
    inputSchema: z.object({
      area: z.enum(["email", "files", "photos", "phone", "banking", "social", "all"]).optional(),
    }),
    handler: async (input: CapabilityBoundaryInput) => capabilityBoundarySummary(input),
  });

  registry.register({
    name: "create_data_inventory_map",
    description: "Create a plain-English map of personal data stored by NitsyClaw.",
    inputSchema: z.object({ includeRetention: z.boolean().optional() }),
    handler: async (input: { includeRetention?: boolean }) => createDataInventoryMap(input),
  });

  registry.register({
    name: "label_action_risk",
    description: "Label the risk level and confirmation requirement for an action.",
    inputSchema: z.object({
      action: z.string().min(1),
      touches: z.array(z.string()).optional(),
      sendsExternally: z.boolean().optional(),
      deletesData: z.boolean().optional(),
      readsPrivateData: z.boolean().optional(),
      moneyOrLegal: z.boolean().optional(),
    }),
    handler: async (input: RiskLabelInput) => labelActionRisk(input),
  });

  registry.register({
    name: "draft_consent_receipt",
    description: "Draft a consent receipt for a permission, account connection, or sensitive action.",
    inputSchema: z.object({
      permission: z.string().min(1),
      accountOrProvider: z.string().optional(),
      scope: z.string().optional(),
      reason: z.string().optional(),
      expires: z.string().optional(),
      grantedAt: z.string().optional(),
    }),
    handler: async (input: ConsentReceiptInput) => draftConsentReceipt(input),
  });

  registry.register({
    name: "plan_private_mode",
    description: "Plan private mode behavior for a sensitive dashboard or WhatsApp turn.",
    inputSchema: z.object({
      surface: z.enum(["dashboard", "whatsapp"]),
      reason: z.string().optional(),
      duration: z.string().optional(),
    }),
    handler: async (input: PrivateModePlanInput) => planPrivateMode(input),
  });

  registry.register({
    name: "review_memory_candidate",
    description: "Decide whether a fact should be pinned, reviewed, or not saved.",
    inputSchema: z.object({
      fact: z.string().min(1),
      source: z.string().optional(),
      sensitivity: z.enum(["normal", "personal", "sensitive"]).optional(),
      expiry: z.string().optional(),
    }),
    handler: async (input: MemoryReviewInput) => reviewMemoryCandidate(input),
  });
}

function capabilityMap(): Record<Exclude<CapabilityBoundaryInput["area"], "all" | undefined>, {
  canDoNow: string[];
  needsSetup: string[];
  blocked: string[];
  approvalRequired: string[];
}> {
  return {
    email: {
      canDoNow: ["search connected inboxes", "queue email drafts"],
      needsSetup: ["provider OAuth and send approval flow for real sending"],
      blocked: ["automatic email sending"],
      approvalRequired: ["creating or sending any draft"],
    },
    files: {
      canDoNow: ["queue selected Drive/OneDrive import requests"],
      needsSetup: ["scoped file picker and read-only provider tokens"],
      blocked: ["broad drive scanning"],
      approvalRequired: ["importing selected private files"],
    },
    photos: {
      canDoNow: ["queue selected Google Photos import requests"],
      needsSetup: ["photo picker and consent receipts"],
      blocked: ["broad photo library scraping"],
      approvalRequired: ["reading selected media"],
    },
    phone: {
      canDoNow: ["draft SMS copy", "queue phone call tasks"],
      needsSetup: ["compliant SMS/phone provider"],
      blocked: ["silent phone calls or SMS sends"],
      approvalRequired: ["any outbound message or call"],
    },
    banking: {
      canDoNow: ["analyze uploaded bank CSVs"],
      needsSetup: ["compliant read-only bank feed provider"],
      blocked: ["live bank access without regulated provider"],
      approvalRequired: ["importing statements"],
    },
    social: {
      canDoNow: ["analyze public social video links"],
      needsSetup: ["upload/public URL handling and content consent"],
      blocked: ["private account scraping"],
      approvalRequired: ["analyzing private or uploaded content"],
    },
  };
}

function inferSensitivity(fact: string): MemorySensitivity {
  if (/\b(health|medical|bank|card|passport|licence|tax|legal|password|secret)\b/i.test(fact)) return "sensitive";
  if (/\b(address|birthday|phone|email|family|child|preference|location)\b/i.test(fact)) return "personal";
  return "normal";
}

function extractDueHint(text: string): string {
  const match = text.match(/\b(today|tomorrow|tonight|this week|next week|by [A-Za-z0-9 ,]+|on [A-Za-z0-9 ,]+)\b/i);
  return match?.[0] ? cleanText(match[0]) : "not set";
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map(cleanText)
    .filter(Boolean);
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? []).map(cleanText).filter(Boolean).slice(0, 20);
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function compact(value: string, max: number): string {
  const cleaned = cleanText(value);
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
}

function sentenceCase(value: string): string {
  const cleaned = cleanText(value);
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}
