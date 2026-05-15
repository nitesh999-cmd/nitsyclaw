export const WHATSAPP_READY_CAPABILITIES = [
  "Ask normal questions and send voice notes.",
  "Remember things, search chat history, and manage reminders.",
  "Summarise bills, selectable PDFs, notes, receipts, and documents.",
  "Log receipt photos, text expenses, and CSV expense import files.",
  "Prepare replies, call scripts, complaints, lists, packing plans, shopping lists, and decision notes.",
  "Queue setup requests for Gmail, Drive, Photos, Spotify, bank feeds, birthdays, phone/SMS, and social video analysis.",
  "Show feature queue status and save new feature or bug requests.",
] as const;

export const WHATSAPP_SETUP_CAPABILITIES = [
  "Gmail/Outlook: search and drafts can be queued; sending needs OAuth scopes and confirmation.",
  "Drive/OneDrive and Google Photos: selected-file/media import needs account picker/OAuth setup.",
  "Spotify: playlist actions need Spotify OAuth connected.",
  "Phone/SMS: drafts work now; real sending/calling needs a compliant provider or phone companion app.",
  "Bank feeds and Facebook birthdays: use safe CSV/manual imports first; live access is blocked until a compliant provider/source exists.",
  "Social video analysis: public URLs/uploads can be queued; private platform access needs approved APIs.",
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
  "connect Google Photos",
  "draft sms to John saying I am late",
  "bill summary: paste bill text",
  "check before send: paste message",
  "upload a CSV expense file",
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
  return "Voice notes, normal questions, reminders, memory/search, documents, receipts, CSV expense import, SMS drafts, queued setup requests, message checks, call scripts, lists, and local summaries.";
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
