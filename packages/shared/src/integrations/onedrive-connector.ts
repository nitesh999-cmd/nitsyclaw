export type OneDriveConnectorState = "ready" | "needs_adapter" | "needs_account" | "needs_setup";

export interface OneDriveConnectorStatus {
  state: OneDriveConnectorState;
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

export function getOneDriveConnectorStatus(env: EnvLike = process.env): OneDriveConnectorStatus {
  const hasApp = has(env, "MS_CLIENT_ID");
  const hasToken = has(env, "MS_TOKEN_JSON");
  const hasSelectedFileAdapter = has(env, "MS_ONEDRIVE_SELECTED_FILE_ADAPTER");

  const safeCommands = [
    "onedrive status",
    "connect OneDrive selected files",
    "summarise this document",
    "queue OneDrive import for <file name>",
  ];
  const safetyRules = [
    "Use selected-file access before any broad OneDrive search.",
    "Show filename/source before summarising private files.",
    "Sharing, deleting, moving, or editing files stays blocked until explicit confirmation rails exist.",
  ];

  if (hasToken && hasSelectedFileAdapter) {
    return {
      state: "ready",
      summary: "Microsoft account token and selected-file OneDrive adapter detected. Selected-file import can be attempted.",
      enabled: ["selected-file import", "document summaries", "queued file search requests", "safe source/filename display"],
      missing: [],
      safeCommands,
      safetyRules,
      nextStep: "Run a selected-file OneDrive import proof before claiming OneDrive reliability.",
    };
  }

  if (hasToken) {
    return {
      state: "needs_adapter",
      summary: "Microsoft account token exists, but selected-file OneDrive import is not wired.",
      enabled: ["setup request queue", "document summary from uploaded/pasted files"],
      missing: ["selected-file OneDrive adapter", "verified Microsoft Graph Files.Read.Selected style boundary"],
      safeCommands,
      safetyRules,
      nextStep: "Build selected-file OneDrive import before claiming private file search.",
    };
  }

  if (hasApp) {
    return {
      state: "needs_account",
      summary: "Microsoft app registration exists, but no Microsoft account token is connected for OneDrive.",
      enabled: ["setup request queue", "document summary from uploaded/pasted files"],
      missing: ["Microsoft account token", "selected-file OneDrive adapter", "verified Microsoft Graph file scopes"],
      safeCommands,
      safetyRules,
      nextStep: "Connect the Microsoft account, then add selected-file OneDrive permissions.",
    };
  }

  return {
    state: "needs_setup",
    summary: "OneDrive is not connected. No Microsoft app registration or account token was detected.",
    enabled: ["setup request queue", "document summary from uploaded/pasted files"],
    missing: ["MS_CLIENT_ID", "Microsoft account token", "selected-file OneDrive adapter", "verified Microsoft Graph file scopes"],
    safeCommands,
    safetyRules,
    nextStep: "Create an Azure app registration, connect one Microsoft account, then add selected-file OneDrive import.",
  };
}

export function formatOneDriveConnectorStatusForWhatsApp(status: OneDriveConnectorStatus): string {
  return [
    "OneDrive connector",
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
