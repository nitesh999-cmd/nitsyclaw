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
  "self test",
  "help",
  "local status",
  "feature queue",
  ...formatCapabilityExamples(8),
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

export function formatReadyCapabilitiesOneLine(): string {
  return "Voice notes, normal questions, reminders, memory/search, documents, bills, expenses, SMS drafts, message checks, call scripts, lists, and feature queue status.";
}

export function formatWhatsAppProviderReadinessBlock(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  return [
    "Provider setup:",
    ...bulletList(PROVIDER_STATUS_ORDER.map((key) => formatProviderReadinessShortLine(providerReadiness[key]))),
  ].join("\n");
}

export function formatWhatsAppHelpReply(
  providerReadiness: Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> = getWhatsAppProviderReadiness(),
): string {
  const setupLines = getWhatsAppSetupCapabilities(providerReadiness).slice(0, 6);
  return [
    "NitsyClaw WhatsApp help",
    "",
    "Quick checks:",
    "- status: ready, pending, and setup-heavy features",
    "- self test: live WhatsApp health, deployed commit, and loop guard",
    "- local status: reminders, expenses, files, and summaries",
    "- feature queue: what is waiting to be built",
    "",
    "Use now:",
    ...bulletList(WHATSAPP_READY_CAPABILITIES.slice(0, 8)),
    "",
    "Needs setup before real action:",
    ...bulletList(setupLines),
    "",
    "Safety limits:",
    ...bulletList(WHATSAPP_SAFETY_LIMITS),
    "",
    "Try these:",
    ...bulletList(WHATSAPP_TRY_COMMANDS),
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
