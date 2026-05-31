export type DriveConnectorState = "ready" | "needs_adapter" | "needs_account" | "needs_setup";

export interface DriveConnectorStatus {
  state: DriveConnectorState;
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

export function getDriveConnectorStatus(env: EnvLike = process.env): DriveConnectorStatus {
  const hasOAuthApp = has(env, "GOOGLE_CREDENTIALS_JSON");
  const hasAccountToken = has(env, "GOOGLE_TOKEN_JSON") || hasAnyPrefix(env, "GOOGLE_TOKEN_JSON_");
  const hasSelectedFileAdapter = has(env, "GOOGLE_DRIVE_SELECTED_FILE_ADAPTER");

  const safeCommands = [
    "drive status",
    "connect Google Drive selected files",
    "summarise this document",
    "queue Drive import for <file name>",
  ];
  const safetyRules = [
    "Use selected-file access before any broad Drive search.",
    "Show filename/source before summarising private files.",
    "Sharing, deleting, moving, or editing files stays blocked until explicit confirmation rails exist.",
  ];

  if (hasAccountToken && hasSelectedFileAdapter) {
    return {
      state: "ready",
      summary: "Google account token and selected-file Drive adapter detected. Selected-file import can be attempted.",
      enabled: ["selected-file import", "document summaries", "queued file search requests", "safe source/filename display"],
      missing: [],
      safeCommands,
      safetyRules,
      nextStep: "Run a selected-file import proof before claiming Drive reliability.",
    };
  }

  if (hasAccountToken) {
    return {
      state: "needs_adapter",
      summary: "Google account token exists, but selected-file Drive import is not wired.",
      enabled: ["setup request queue", "document summary from uploaded/pasted files"],
      missing: ["selected-file Drive adapter", "verified Drive scopes"],
      safeCommands,
      safetyRules,
      nextStep: "Build selected-file Drive import before claiming private file search.",
    };
  }

  if (hasOAuthApp) {
    return {
      state: "needs_account",
      summary: "Google OAuth app exists, but no Google account token is connected for Drive.",
      enabled: ["setup request queue", "document summary from uploaded/pasted files"],
      missing: ["Google account token", "selected-file Drive adapter", "verified Drive scopes"],
      safeCommands,
      safetyRules,
      nextStep: "Connect the Google account, then add selected-file Drive permissions.",
    };
  }

  return {
    state: "needs_setup",
    summary: "Google Drive is not connected. No Google OAuth app or account token was detected.",
    enabled: ["setup request queue", "document summary from uploaded/pasted files"],
    missing: ["GOOGLE_CREDENTIALS_JSON", "Google account token", "selected-file Drive adapter", "verified Drive scopes"],
    safeCommands,
    safetyRules,
    nextStep: "Create Google OAuth credentials, connect one Google account, then add selected-file Drive import.",
  };
}

export function formatDriveConnectorStatusForWhatsApp(status: DriveConnectorStatus): string {
  return [
    "Google Drive connector",
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
