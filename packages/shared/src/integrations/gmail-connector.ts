export type GmailConnectorState = "ready" | "needs_account" | "needs_setup";

export interface GmailConnectorStatus {
  state: GmailConnectorState;
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

function hasAnyPrefix(env: EnvLike, prefix: string): boolean {
  return Object.keys(env).some((key) => key.startsWith(prefix) && Boolean(env[key]?.trim()));
}

export function getGmailConnectorStatus(env: EnvLike = process.env): GmailConnectorStatus {
  const hasOAuthApp = has(env, "GOOGLE_CREDENTIALS_JSON");
  const hasAccountToken = has(env, "GOOGLE_TOKEN_JSON") || hasAnyPrefix(env, "GOOGLE_TOKEN_JSON_");

  const safeCommands = [
    "gmail status",
    "connect Gmail so you can draft replies",
    "search Gmail for <keyword>",
    "draft email to name@example.com about <topic>",
  ];
  const safetyRules = [
    "Read/search can only work after a Google account token exists.",
    "Draft creation needs explicit approval.",
    "Sending is not automatic and is not exposed as a WhatsApp command.",
  ];

  if (hasAccountToken) {
    return {
      state: "ready",
      summary: "Google account token detected. Gmail read/search can be attempted; drafts remain approval-gated.",
      enabled: ["unread summaries", "read-only search", "draft request queue", "follow-up extraction from searched mail"],
      missing: [],
      safeCommands,
      safetyRules,
      nextStep: "Run a Gmail search proof and verify scopes before claiming live mailbox reliability.",
    };
  }

  if (hasOAuthApp) {
    return {
      state: "needs_account",
      summary: "Google OAuth app exists, but no Gmail account token is connected.",
      enabled: ["setup request queue", "email draft planning without mailbox access"],
      missing: ["Google account token", "verified Gmail scopes"],
      safeCommands,
      safetyRules,
      nextStep: "Connect the Google mailbox account, then run a read-only Gmail search proof.",
    };
  }

  return {
    state: "needs_setup",
    summary: "Gmail is not connected. No Google OAuth app or account token was detected.",
    enabled: ["setup request queue", "email draft planning without mailbox access"],
    missing: ["GOOGLE_CREDENTIALS_JSON", "Google account token", "verified Gmail scopes"],
    safeCommands,
    safetyRules,
    nextStep: "Create Google OAuth credentials, connect one mailbox account, then run a read-only Gmail search proof.",
  };
}

export function formatGmailConnectorStatusForWhatsApp(status: GmailConnectorStatus): string {
  return [
    "Gmail connector",
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
