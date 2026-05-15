export const WHATSAPP_READY_CAPABILITIES = [
  "Ask normal questions and send voice notes.",
  "Remember things, search chat history, and manage reminders.",
  "Summarise bills, selectable PDFs, notes, receipts, and documents.",
  "Log receipt photos, text expenses, and CSV expense import files.",
  "Prepare replies, call scripts, complaints, lists, packing plans, shopping lists, and decision notes.",
  "Show feature queue status and save new feature or bug requests.",
] as const;

export const WHATSAPP_SETUP_CAPABILITIES = [
  "Real email sending needs Gmail/Outlook account setup.",
  "Drive, OneDrive, Google Photos, Spotify, phone/SMS, bank feeds, and Facebook birthdays need provider setup.",
] as const;

export const WHATSAPP_SAFETY_LIMITS = [
  "SMS drafts only until a phone/SMS provider is connected and approved.",
  "Email drafts only until mailbox OAuth is connected and approved.",
  "Anything that sends, calls, deletes, books, pays, or changes external data needs confirmation first.",
] as const;

export const WHATSAPP_TRY_COMMANDS = [
  "status",
  "local status",
  "feature queue",
  "build status",
  "bill summary: paste bill text",
  "check before send: paste message",
  "upload a CSV expense file",
] as const;

function bulletList(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

export function formatReadyCapabilitiesOneLine(): string {
  return "Voice notes, normal questions, reminders, memory/search, documents, receipts, CSV expense import, message checks, call scripts, lists, and local summaries.";
}

export function formatWhatsAppHelpReply(): string {
  return [
    "Working now:",
    ...bulletList(WHATSAPP_READY_CAPABILITIES),
    "",
    "Needs setup:",
    ...bulletList(WHATSAPP_SETUP_CAPABILITIES),
    "",
    "Safety limits:",
    ...bulletList(WHATSAPP_SAFETY_LIMITS),
    "",
    "Try:",
    ...bulletList(WHATSAPP_TRY_COMMANDS),
  ].join("\n");
}

export function formatWhatsAppSafetyLimitsBlock(): string {
  return ["Safety limits:", ...bulletList(WHATSAPP_SAFETY_LIMITS)].join("\n");
}
