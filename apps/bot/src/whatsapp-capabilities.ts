import {
  formatCapabilityExamples,
  formatCapabilitySetupLine,
  formatCapabilitySummaryLine,
  getCapabilitiesByStatus,
} from "./whatsapp-capability-registry.js";
import {
  type WhatsAppProviderReadiness,
  type WhatsAppProviderReadinessKey,
  formatProviderReadinessShortLine,
  getWhatsAppProviderReadiness,
} from "./whatsapp-provider-readiness.js";

export const WHATSAPP_READY_CAPABILITIES = getCapabilitiesByStatus("ready").map(formatCapabilitySummaryLine);

const PROVIDER_STATUS_ORDER: readonly WhatsAppProviderReadinessKey[] = [
  "gmail",
  "outlook",
  "drive",
  "onedrive",
  "google-photos",
  "spotify",
  "bank-feeds",
  "phone-sms",
  "birthdays",
  "social-video",
];

export function getWhatsAppSetupCapabilities(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string[] {
  return [
    ...getCapabilitiesByStatus("needs_setup").map((capability) => formatCapabilitySetupLine(capability, providerReadiness)),
    ...getCapabilitiesByStatus("approval_required").map((capability) => formatCapabilitySetupLine(capability, providerReadiness)),
  ];
}

export const WHATSAPP_SAFETY_LIMITS = [
  "SMS drafts only until a phone/SMS provider is connected and approved.",
  "Email drafts only until mailbox OAuth is connected and approved.",
  "Anything that sends, calls, deletes, books, pays, or changes external data needs confirmation first.",
] as const;

export const WHATSAPP_TRY_COMMANDS = [
  "status",
  "canary test",
  "self test",
  "what went wrong",
  "help",
  "local status",
  "feature queue",
  ...formatCapabilityExamples(8),
] as const;

export const WHATSAPP_PRACTICAL_EXAMPLES = [
  "Remind me to call Mukesh tomorrow at 10 am",
  "I spent $18.40 at Chemist Warehouse for medicine",
  "expense summary",
  "bill summary: AGL bill $240 due 18 May",
  "check before send: I am angry about this bill",
  "call script: energy retailer | ask for a better rate",
  "draft sms to John saying I am running late",
  "remember my passport is in the top drawer",
  "read my last message",
  "what went wrong",
] as const;

export const WHATSAPP_MENU_SECTIONS = [
  {
    title: "Everyday help",
    items: [
      "Ask normal questions and get a short answer",
      "Voice notes: transcribe, understand, reply in English",
      "Remember important notes and find recent chat history",
      "Check a message before you send it",
    ],
  },
  {
    title: "Life admin",
    items: [
      "Reminders and daily status",
      "Expenses from text, receipt photos, and CSV files",
      "Bill summaries from pasted text or supported documents",
      "Call scripts, complaint drafts, shopping lists, and decision notes",
    ],
  },
  {
    title: "Operator checks",
    items: [
      "status: ready, pending, and setup-heavy features",
      "canary test: live WhatsApp proof",
      "what went wrong: recent failures and loop guard state",
      "feature queue: what is waiting to be built",
    ],
  },
  {
    title: "Needs setup first",
    items: [
      "Email, cloud files, photos, Spotify, bank feeds, calls, and real SMS need account/provider setup",
      "Send status for the exact connected/missing list",
    ],
  },
] as const;

export const WHATSAPP_COMMAND_OUTCOMES = [
  "answered: I understood and replied.",
  "saved: I stored the note, reminder, expense, file, or request.",
  "needs clarification: I need one short answer before acting.",
  "needs approval: the action is risky, so I wait for confirmation.",
  "needs setup: the feature requires account/provider access first.",
  "blocked for safety: I will not do unsafe or wrong-recipient actions.",
  "failed with reason: I hit an error and tell you the safest next step.",
] as const;

function bulletList(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function numberedList(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function compactList(items: readonly string[], limit = 5): string {
  if (!items.length) return "none";
  const visible = items.slice(0, limit).join(", ");
  const remaining = items.length - limit;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
}

export function formatReadyCapabilitiesOneLine(): string {
  return "Voice notes, normal questions, reminders, memory and recent-chat search, documents, bills, expenses, SMS drafts, message checks, call scripts, lists, and feature queue status.";
}

export function formatWhatsAppProviderReadinessBlock(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  return [
    "Provider setup:",
    ...bulletList(PROVIDER_STATUS_ORDER.map((key) => formatProviderReadinessShortLine(providerReadiness[key]))),
  ].join("\n");
}

export function formatWhatsAppProviderSetupSnapshot(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  const items = PROVIDER_STATUS_ORDER.map((key) => providerReadiness[key]).filter(Boolean);
  const usable = items
    .filter((item) => item.status === "ready" || item.status === "partial")
    .map((item) => item.label);
  const needsSetup = items
    .filter((item) => item.status === "needs_setup" || item.status === "needs_account" || item.status === "needs_adapter")
    .map((item) => item.label);
  const approvalOnly = items
    .filter((item) => item.status === "approval_required")
    .map((item) => item.label);

  return [
    "Setup snapshot:",
    `- Ready/partly ready: ${compactList(usable)}`,
    `- Needs setup/account/adapter: ${compactList(needsSetup)}`,
    `- Draft/approval-only: ${compactList(approvalOnly)}`,
    "- For exact provider details, send: status",
  ].join("\n");
}

export function formatWhatsAppHelpReply(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  const needsSetup = PROVIDER_STATUS_ORDER
    .map((key) => providerReadiness[key])
    .filter((item) => item.status === "needs_setup" || item.status === "needs_account" || item.status === "needs_adapter")
    .map((item) => item.label);

  return [
    "NitsyClaw menu",
    "Say it normally. I can answer, remind, remember, log expenses, summarise bills, and draft messages.",
    "",
    "Try:",
    ...numberedList(WHATSAPP_PRACTICAL_EXAMPLES.slice(0, 5)),
    "",
    "Works now: questions/voice, reminders, memory, AUD expenses, bill/document summaries, SMS/reply/call-script drafts.",
    "",
    `Needs setup: ${compactList(needsSetup, 6)}.`,
    "I can queue setup requests, but I will not pretend they are connected.",
    "",
    "Safety: I draft before risky actions. Sending, calling, deleting, booking, paying, or changing external data needs confirmation.",
    "",
    "More: status | proof test | what went wrong | feature queue | local status",
  ].join("\n");
}

export function formatWhatsAppCapabilityMatrix(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  return [
    "What I can do from WhatsApp",
    "",
    "Ready now:",
    ...bulletList(WHATSAPP_READY_CAPABILITIES),
    "",
    "Needs setup or approval:",
    ...bulletList(getWhatsAppSetupCapabilities(providerReadiness)),
    "",
    "Rule: if something is not ready, I should say that clearly and explain the next step.",
  ].join("\n");
}

export function formatWhatsAppSafetyLimitsBlock(): string {
  return ["Safety limits:", ...bulletList(WHATSAPP_SAFETY_LIMITS)].join("\n");
}

export function formatWhatsAppCommandContractReply(): string {
  return [
    "WhatsApp command contract",
    "",
    "Every command should end as one of these:",
    ...bulletList(WHATSAPP_COMMAND_OUTCOMES),
    "",
    "Rule: no silent failures. If I cannot act, I should say why.",
  ].join("\n");
}
