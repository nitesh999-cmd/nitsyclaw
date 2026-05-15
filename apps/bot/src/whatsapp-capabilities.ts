import {
  formatCapabilityExamples,
  formatCapabilitySetupLine,
  formatCapabilitySummaryLine,
  getCapabilitiesByStatus,
} from "./whatsapp-capability-registry.js";
import { getWhatsAppProviderReadiness } from "./whatsapp-provider-readiness.js";

export const WHATSAPP_READY_CAPABILITIES = getCapabilitiesByStatus("ready").map(formatCapabilitySummaryLine);

export function getWhatsAppSetupCapabilities(): string[] {
  const providerReadiness = getWhatsAppProviderReadiness();
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

export function formatWhatsAppHelpReply(): string {
  return [
    "Working now:",
    ...bulletList(WHATSAPP_READY_CAPABILITIES),
    "",
    "Needs setup:",
    ...bulletList(getWhatsAppSetupCapabilities()),
    "",
    "Safety limits:",
    ...bulletList(WHATSAPP_SAFETY_LIMITS),
    "",
    "Try:",
    ...bulletList(WHATSAPP_TRY_COMMANDS),
  ].join("\n");
}

export function formatWhatsAppCapabilityMatrix(): string {
  return [
    "What I can do from WhatsApp",
    "",
    "Ready now:",
    ...bulletList(WHATSAPP_READY_CAPABILITIES),
    "",
    "Needs setup or approval:",
    ...bulletList(getWhatsAppSetupCapabilities()),
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
