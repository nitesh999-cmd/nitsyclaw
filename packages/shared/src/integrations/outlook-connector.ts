export type OutlookConnectorState = "ready" | "needs_account" | "needs_setup";

export interface OutlookConnectorStatus {
  state: OutlookConnectorState;
  summary: string;
  enabled: string[];
  missing: string[];
  safeCommands: string[];
  safetyRules: string[];
  nextStep: string;
}

type EnvLike = Record<string, string | undefined>;

function has(env: EnvLike, key: string): boolean {
  return Boolean(env[key]?.trim());
}

export function getOutlookConnectorStatus(env: EnvLike = process.env): OutlookConnectorStatus {
  const hasApp = has(env, "MS_CLIENT_ID");
  const hasToken = has(env, "MS_TOKEN_JSON");

  const safeCommands = [
    "outlook status",
    "connect Outlook so you can search my mailbox",
    "draft email to name@example.com about <topic>",
    "morning brief",
  ];
  const safetyRules = [
    "Read/unread summaries can only work after Microsoft account auth exists.",
    "Draft or send-like work must stay approval-gated.",
    "Automatic sending is not exposed as a WhatsApp command.",
  ];

  if (hasToken) {
    return {
      state: "ready",
      summary: "Microsoft account token detected. Outlook read/unread checks can be attempted; writing stays approval-gated.",
      enabled: ["unread summaries", "mail metadata for briefs", "draft request queue", "follow-up extraction from mailbox context"],
      missing: [],
      safeCommands,
      safetyRules,
      nextStep: "Run an Outlook unread-mail proof and verify Graph scopes before claiming live mailbox reliability.",
    };
  }

  if (hasApp) {
    return {
      state: "needs_account",
      summary: "Microsoft app registration exists, but no Outlook account token is connected.",
      enabled: ["setup request queue", "email draft planning without mailbox access"],
      missing: ["Microsoft account token", "verified Microsoft Graph mail scopes"],
      safeCommands,
      safetyRules,
      nextStep: "Run Microsoft device-code auth, then run an Outlook unread-mail proof.",
    };
  }

  return {
    state: "needs_setup",
    summary: "Outlook is not connected. No Microsoft app registration or account token was detected.",
    enabled: ["setup request queue", "email draft planning without mailbox access"],
    missing: ["MS_CLIENT_ID", "Microsoft account token", "verified Microsoft Graph mail scopes"],
    safeCommands,
    safetyRules,
    nextStep: "Create an Azure app registration, connect the mailbox account, then run an unread-mail proof.",
  };
}

export function formatOutlookConnectorStatusForWhatsApp(status: OutlookConnectorStatus): string {
  return [
    "Outlook connector",
    `Status: ${status.state.replace(/_/g, " ")}`,
    status.summary,
    "",
    "Works now:",
    ...status.enabled.map((item) => `- ${item}`),
    "",
    "Missing:",
    ...(status.missing.length ? status.missing.map((item) => `- ${item}`) : ["- nothing detected"]),
    "",
    "Safety:",
    ...status.safetyRules.map((item) => `- ${item}`),
    "",
    `Next: ${status.nextStep}`,
    `Try: ${status.safeCommands.join(" | ")}`,
  ].join("\n");
}
