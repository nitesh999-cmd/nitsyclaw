export type WhatsAppCapabilityStatus = "ready" | "needs_setup" | "approval_required";

export interface WhatsAppCapability {
  id: string;
  label: string;
  status: WhatsAppCapabilityStatus;
  summary: string;
  setup?: string;
  safety?: string;
  examples: readonly string[];
}

export const WHATSAPP_CAPABILITY_REGISTRY = [
  {
    id: "voice-and-questions",
    label: "Voice notes and normal questions",
    status: "ready",
    summary: "Understand voice notes, transcribe them, and answer normal questions.",
    examples: ["Hi", "What is the weather tomorrow?", "Explain this in simple English."],
  },
  {
    id: "reminders",
    label: "Reminders",
    status: "ready",
    summary: "Save clear reminders inside NitsyClaw and show pending reminders.",
    examples: ["Remind me to call Mukesh tomorrow at 10 am", "pending reminders"],
  },
  {
    id: "memory-and-search",
    label: "Memory and search",
    status: "ready",
    summary: "Remember notes, search recent WhatsApp context, and repeat the last message.",
    examples: ["Remember my passport is in the top drawer", "read my last message"],
  },
  {
    id: "documents-and-bills",
    label: "Documents and bills",
    status: "ready",
    summary: "Read text documents and selectable PDFs, then summarise bills and key dates.",
    examples: ["Send a text bill", "bill summary: AGL bill $240 due 18 May 2026"],
  },
  {
    id: "expenses",
    label: "Expenses",
    status: "ready",
    summary: "Log text expenses, receipt photos, and CSV expense imports in AUD by default.",
    examples: ["I spent $18.40 at Chemist Warehouse for medicine", "expense summary"],
  },
  {
    id: "safe-writing",
    label: "Safe writing help",
    status: "ready",
    summary: "Prepare replies, call scripts, complaints, lists, plans, and decision notes.",
    examples: ["check before send: I am furious about this bill", "call script: energy retailer | ask for better rate"],
  },
  {
    id: "feature-queue",
    label: "Feature and bug queue",
    status: "ready",
    summary: "Show pending work and safely save new feature or bug requests.",
    examples: ["pending items", "bug: weather picked the wrong city"],
  },
  {
    id: "sms-drafts",
    label: "SMS drafts",
    status: "ready",
    summary: "Prepare SMS text for a contact without sending it.",
    safety: "Real sending stays blocked until a compliant phone/SMS provider is connected and approved.",
    examples: ["draft sms to John saying I am late"],
  },
  {
    id: "email",
    label: "Gmail and Outlook",
    status: "needs_setup",
    summary: "Queue mailbox setup requests for reading, searching, drafting, and approved sending.",
    setup: "Needs OAuth account connection and strict send confirmation.",
    safety: "No mailbox is accessed until OAuth setup is complete.",
    examples: ["connect Gmail so you can draft replies", "set up Outlook search"],
  },
  {
    id: "files",
    label: "Google Drive and OneDrive",
    status: "needs_setup",
    summary: "Queue file and document access requests.",
    setup: "Needs account picker/OAuth and selected-file permission boundaries.",
    safety: "No cloud file account is accessed from WhatsApp yet.",
    examples: ["browse my Google Drive files", "connect OneDrive documents"],
  },
  {
    id: "google-photos",
    label: "Google Photos",
    status: "needs_setup",
    summary: "Queue photo search and selected-media import requests.",
    setup: "Needs Google Photos access approval and selected-library rules.",
    safety: "No photo library is accessed until setup is complete.",
    examples: ["set up Google Photos search for family pictures"],
  },
  {
    id: "spotify",
    label: "Spotify",
    status: "needs_setup",
    summary: "Queue playlist and music assistant requests.",
    setup: "Needs Spotify OAuth.",
    examples: ["create suggested playlist in Spotify"],
  },
  {
    id: "bank-feeds",
    label: "Bank feeds",
    status: "needs_setup",
    summary: "Use CSV/manual imports now; queue live bank-feed requests for later.",
    setup: "Live feeds need a compliant financial data provider and consent flow.",
    safety: "No bank account is connected from WhatsApp yet.",
    examples: ["connect bank feeds for expenses", "import card feed expenses"],
  },
  {
    id: "birthdays",
    label: "Birthdays",
    status: "needs_setup",
    summary: "Queue Facebook birthday or birthday message setup requests.",
    setup: "Needs a lawful source such as manual import, contacts export, or approved API.",
    examples: ["connect Facebook birthdays"],
  },
  {
    id: "phone-actions",
    label: "Phone calls and SMS sending",
    status: "approval_required",
    summary: "Drafts are available now; real calling or sending needs provider setup and user confirmation.",
    setup: "Needs phone companion app or compliant telephony/SMS provider.",
    safety: "Wrong-recipient actions must remain approval-gated.",
    examples: ["set up phone/SMS", "access SMS logs"],
  },
  {
    id: "social-video",
    label: "Social video analysis",
    status: "needs_setup",
    summary: "Queue public URL or upload analysis requests for Instagram, YouTube, TikTok, and Facebook.",
    setup: "Public URLs/uploads can be queued; private platform access needs approved APIs.",
    examples: ["analyse this Instagram reel https://example.com/reel/1"],
  },
] as const satisfies readonly WhatsAppCapability[];

export function getCapabilitiesByStatus(status: WhatsAppCapabilityStatus): WhatsAppCapability[] {
  return WHATSAPP_CAPABILITY_REGISTRY.filter((capability) => capability.status === status);
}

export function formatCapabilitySummaryLine(capability: WhatsAppCapability): string {
  return `${capability.label}: ${capability.summary}`;
}

export function formatCapabilitySetupLine(capability: WhatsAppCapability): string {
  const detail = capability.setup ?? capability.safety ?? capability.summary;
  const safety = capability.safety && capability.safety !== detail ? ` Safety: ${capability.safety}` : "";
  return `${capability.label}: ${detail}${safety}`;
}

export function formatCapabilityExamples(limit = 8): string[] {
  const primary: string[] = WHATSAPP_CAPABILITY_REGISTRY
    .map((capability) => capability.examples[0])
    .filter((example): example is NonNullable<typeof example> => Boolean(example));
  const remaining = WHATSAPP_CAPABILITY_REGISTRY.flatMap((capability) => capability.examples.slice(1));
  return [...primary, ...remaining].slice(0, limit);
}
