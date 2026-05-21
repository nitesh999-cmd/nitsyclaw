export type ProviderSetupStatus =
  | "ready"
  | "partial"
  | "needs_account"
  | "needs_setup"
  | "needs_adapter"
  | "approval_required"
  | "blocked";

export interface ProviderSetupReadiness {
  key: string;
  label: string;
  status: ProviderSetupStatus;
  summary: string;
  configured: string[];
  missing: string[];
  nextStep: string;
  safety: string;
  healthChecks: ProviderHealthCheck[];
}

export interface ProviderHealthCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  detail: string;
}

export interface ProviderSetupSignals {
  spotifyConnected?: boolean;
  spotifyExpiresAt?: Date | string | null;
  spotifyHasRefreshToken?: boolean;
}

export interface ProviderReadinessSummary {
  total: number;
  readyOrPartial: number;
  needsSetup: number;
  blocked: number;
  approvalRequired: number;
  connectedLabels: string[];
  setupLabels: string[];
  blockedLabels: string[];
  launchBlockers: string[];
}

type EnvLike = Record<string, string | undefined>;

function has(env: EnvLike, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function hasAnyPrefix(env: EnvLike, prefix: string): boolean {
  return Object.keys(env).some((key) => key.startsWith(prefix) && Boolean(env[key]?.trim()));
}

function configuredIf(value: boolean, label: string): string[] {
  return value ? [label] : [];
}

function healthCheck(
  name: string,
  status: ProviderHealthCheck["status"],
  detail: string,
): ProviderHealthCheck {
  return { name, status, detail };
}

function readiness(input: Omit<ProviderSetupReadiness, "healthChecks"> & {
  healthChecks?: ProviderHealthCheck[];
}): ProviderSetupReadiness {
  return {
    ...input,
    healthChecks: input.healthChecks ?? [],
  };
}

function tokenFreshness(value: Date | string | null | undefined): "unknown" | "fresh" | "expires_soon" | "expired" {
  if (!value) return "unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "expired";
  if (ms <= 24 * 60 * 60 * 1000) return "expires_soon";
  return "fresh";
}

function formatTokenFreshness(value: Date | string | null | undefined): string {
  const state = tokenFreshness(value);
  if (state === "unknown") return "token expiry unknown";
  const date = value instanceof Date ? value : new Date(value!);
  const stamp = date.toISOString().slice(0, 16).replace("T", " ");
  if (state === "expired") return `token expired at ${stamp} UTC`;
  if (state === "expires_soon") return `token expires soon at ${stamp} UTC`;
  return `token fresh until ${stamp} UTC`;
}

export function dashboardStatus(status: ProviderSetupStatus): "Connected" | "Needs setup" | "Blocked" | "Read-only" | "Local only" | "Partial" {
  switch (status) {
    case "ready":
      return "Connected";
    case "partial":
      return "Partial";
    case "blocked":
      return "Blocked";
    case "approval_required":
    case "needs_account":
    case "needs_adapter":
    case "needs_setup":
      return "Needs setup";
  }
}

export function getProviderSetupReadiness(
  env: EnvLike = process.env,
  signals: ProviderSetupSignals = {},
): ProviderSetupReadiness[] {
  const googleCredentials = has(env, "GOOGLE_CREDENTIALS_JSON");
  const googleToken = has(env, "GOOGLE_TOKEN_JSON") || hasAnyPrefix(env, "GOOGLE_TOKEN_JSON_");
  const microsoftClient = has(env, "MS_CLIENT_ID");
  const microsoftToken = has(env, "MS_TOKEN_JSON");
  const spotifyApp = has(env, "SPOTIFY_CLIENT_ID") && has(env, "SPOTIFY_CLIENT_SECRET") && has(env, "SPOTIFY_REDIRECT_URI");
  const database = has(env, "DATABASE_URL") || has(env, "DATABASE_URL_DIRECT");
  const spotifyFreshness = tokenFreshness(signals.spotifyExpiresAt);
  const spotifyTokenProblem = Boolean(signals.spotifyConnected) && spotifyFreshness === "expired" && !signals.spotifyHasRefreshToken;

  return [
    readiness({
      key: "gmail",
      label: "Gmail",
      status: googleToken ? "partial" : googleCredentials ? "needs_account" : "needs_setup",
      summary: googleToken
        ? "Google account token detected. Reads/drafts can be checked, but sending stays confirmation-gated."
        : googleCredentials
          ? "Google OAuth app exists. A mailbox account still needs to be connected."
          : "No Google OAuth credentials or account token detected.",
      configured: [...configuredIf(googleCredentials, "Google OAuth app"), ...configuredIf(googleToken, "Google account token")],
      missing: googleToken ? [] : googleCredentials ? ["Google account token"] : ["GOOGLE_CREDENTIALS_JSON", "Google account token"],
      nextStep: googleToken ? "Verify Gmail scopes before claiming live mailbox action." : "Connect the Google mailbox account.",
      safety: "No email is sent without confirmation.",
      healthChecks: [
        healthCheck("OAuth app", googleCredentials ? "pass" : "fail", googleCredentials ? "Google OAuth app env is present." : "GOOGLE_CREDENTIALS_JSON is missing."),
        healthCheck("Account token", googleToken ? "warn" : "fail", googleToken ? "Token exists; scopes still need proof." : "No Google account token detected."),
        healthCheck("Risk gate", "pass", "Email sending remains confirmation-gated."),
      ],
    }),
    readiness({
      key: "outlook",
      label: "Outlook / M365",
      status: microsoftToken ? "partial" : microsoftClient ? "needs_account" : "needs_setup",
      summary: microsoftToken
        ? "Microsoft token detected. Reads/calendar can work where scopes are healthy."
        : microsoftClient
          ? "Microsoft app registration exists. The user account still needs device-code auth."
          : "Microsoft app registration is not configured yet.",
      configured: [...configuredIf(microsoftClient, "Microsoft app registration"), ...configuredIf(microsoftToken, "Microsoft account token")],
      missing: microsoftToken ? [] : microsoftClient ? ["Microsoft account token"] : ["MS_CLIENT_ID", "Microsoft account token"],
      nextStep: microsoftToken ? "Verify Graph scopes before claiming live Outlook actions." : "Run Microsoft device-code auth.",
      safety: "No email/calendar change is made without confirmation.",
      healthChecks: [
        healthCheck("App registration", microsoftClient ? "pass" : "fail", microsoftClient ? "MS_CLIENT_ID is present." : "MS_CLIENT_ID is missing."),
        healthCheck("Account token", microsoftToken ? "warn" : "fail", microsoftToken ? "Token exists; Graph scopes still need proof." : "No Microsoft account token detected."),
        healthCheck("Risk gate", "pass", "Mail and calendar writes remain confirmation-gated."),
      ],
    }),
    readiness({
      key: "calendar",
      label: "Google / Outlook Calendar",
      status: googleToken || microsoftToken ? "partial" : "needs_account",
      summary: googleToken || microsoftToken ? "At least one calendar-capable account token is present." : "No calendar-capable account token is detected.",
      configured: [...configuredIf(googleToken, "Google account token"), ...configuredIf(microsoftToken, "Microsoft account token")],
      missing: googleToken || microsoftToken ? [] : ["Google or Microsoft account token"],
      nextStep: googleToken || microsoftToken ? "Verify token health and show the calendar name before changes." : "Connect Google or Microsoft first.",
      safety: "Calendar writes stay confirmation-gated.",
      healthChecks: [
        healthCheck("Calendar-capable token", googleToken || microsoftToken ? "warn" : "fail", googleToken || microsoftToken ? "A provider token exists; calendar scopes still need proof." : "No Google or Microsoft token detected."),
        healthCheck("Risk gate", "pass", "Calendar writes remain confirmation-gated."),
      ],
    }),
    readiness({
      key: "spotify",
      label: "Spotify",
      status: spotifyTokenProblem ? "needs_account" : signals.spotifyConnected ? "partial" : spotifyApp ? "needs_account" : "needs_setup",
      summary: spotifyTokenProblem
        ? `Spotify account token is expired and no refresh token is stored (${formatTokenFreshness(signals.spotifyExpiresAt)}).`
        : signals.spotifyConnected
        ? `Spotify account token is stored (${formatTokenFreshness(signals.spotifyExpiresAt)}).`
        : spotifyApp
          ? "Spotify OAuth app is configured; user account connection is still required before live playlist actions."
          : "Spotify OAuth env vars are incomplete.",
      configured: [...configuredIf(spotifyApp, "Spotify OAuth app"), ...configuredIf(Boolean(signals.spotifyConnected), "Spotify account token")],
      missing: spotifyTokenProblem
        ? ["Fresh Spotify account token or refresh token"]
        : signals.spotifyConnected
          ? []
          : spotifyApp ? ["Spotify account token"] : ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"],
      nextStep: spotifyTokenProblem ? "Reconnect Spotify OAuth." : signals.spotifyConnected ? "Run a top-tracks proof." : "Connect Spotify OAuth.",
      safety: "Playlist creation stays confirmation-gated.",
      healthChecks: [
        healthCheck("OAuth app", spotifyApp ? "pass" : "fail", spotifyApp ? "Spotify OAuth env is complete." : "Spotify OAuth env is incomplete."),
        healthCheck("Account token", signals.spotifyConnected ? (spotifyTokenProblem ? "fail" : "warn") : "fail", signals.spotifyConnected ? formatTokenFreshness(signals.spotifyExpiresAt) : "No Spotify account token detected."),
        healthCheck("Refresh token", signals.spotifyConnected ? (signals.spotifyHasRefreshToken ? "pass" : "warn") : "not_applicable", signals.spotifyConnected ? (signals.spotifyHasRefreshToken ? "Refresh token stored." : "No refresh token stored; reconnect may be needed.") : "Only checked after account connection."),
        healthCheck("Risk gate", "pass", "Playlist creation remains confirmation-gated."),
      ],
    }),
    readiness({
      key: "drive",
      label: "Google Drive",
      status: googleToken ? "needs_adapter" : "needs_setup",
      summary: googleToken ? "Google account token exists, but selected-file Drive import is not wired." : "No Google account token is detected for Drive.",
      configured: configuredIf(googleToken, "Google account token"),
      missing: googleToken ? ["Selected-file Drive adapter/scopes"] : ["Google account token", "Selected-file Drive adapter/scopes"],
      nextStep: "Add selected-file Drive permissions before browsing private files.",
      safety: "Show filename/source before summarising private files.",
      healthChecks: [
        healthCheck("Account token", googleToken ? "warn" : "fail", googleToken ? "Google token exists; Drive scopes still need proof." : "No Google account token detected."),
        healthCheck("Adapter", "fail", "Selected-file Drive import is not wired yet."),
        healthCheck("Privacy gate", "pass", "Broad background Drive browsing is not claimed."),
      ],
    }),
    readiness({
      key: "photos",
      label: "Google Photos",
      status: googleToken ? "needs_adapter" : "needs_setup",
      summary: googleToken ? "Google account token exists, but Photos picker/API flow is not wired." : "No Google account token is detected for Photos.",
      configured: configuredIf(googleToken, "Google account token"),
      missing: googleToken ? ["Photos picker/API adapter"] : ["Google account token", "Photos picker/API adapter"],
      nextStep: "Build selected-media picker/import before claiming photo search.",
      safety: "Avoid broad background photo scanning.",
      healthChecks: [
        healthCheck("Account token", googleToken ? "warn" : "fail", googleToken ? "Google token exists; Photos scopes still need proof." : "No Google account token detected."),
        healthCheck("Adapter", "fail", "Selected-media Photos picker/import is not wired yet."),
        healthCheck("Privacy gate", "pass", "Broad background photo scanning is not claimed."),
      ],
    }),
    readiness({
      key: "phone-sms",
      label: "Phone/SMS",
      status: "approval_required",
      summary: "Drafts work. Real sending/calling is intentionally blocked until a provider is chosen.",
      configured: [],
      missing: ["SMS/call provider or phone companion"],
      nextStep: "Choose provider, then require exact contact confirmation before send/call.",
      safety: "Wrong-recipient checks are mandatory.",
      healthChecks: [
        healthCheck("Draft mode", "pass", "SMS drafts and call scripts are available."),
        healthCheck("Provider", "fail", "No SMS/call provider or phone companion is configured."),
        healthCheck("Risk gate", "pass", "Real sending/calling is blocked until provider and confirmation rules exist."),
      ],
    }),
    readiness({
      key: "bank-feeds",
      label: "Bank feeds",
      status: "blocked",
      summary: "Live feeds need a compliant provider and consent flow. CSV/manual expenses can work now.",
      configured: configuredIf(database, "Database"),
      missing: ["Compliant bank-data provider", "Consent/retry/dedupe/revoke flow"],
      nextStep: "Use CSV/manual import until provider consent is real.",
      safety: "Do not connect bank data without clear consent and revoke controls.",
      healthChecks: [
        healthCheck("Database", database ? "pass" : "fail", database ? "Database env is present." : "Database env is missing."),
        healthCheck("Provider", "fail", "No compliant bank-data provider is configured."),
        healthCheck("Consent gate", "fail", "Consent, revoke, retry, and dedupe flow is not implemented for live feeds."),
      ],
    }),
    readiness({
      key: "birthdays",
      label: "Birthdays",
      status: "needs_setup",
      summary: "No lawful birthday source is connected.",
      configured: [],
      missing: ["Manual/CSV/contact import source"],
      nextStep: "Start with manual, CSV, or contact import before social-platform access.",
      safety: "Do not scrape private social data.",
      healthChecks: [
        healthCheck("Import source", "fail", "No manual/CSV/contact birthday source is connected."),
        healthCheck("Privacy gate", "pass", "Private social scraping is not claimed."),
      ],
    }),
    readiness({
      key: "social-video",
      label: "Social video",
      status: "needs_adapter",
      summary: "Public URL/upload analysis can be queued. Private platform adapters are not wired.",
      configured: [],
      missing: ["Public URL/upload adapter", "Approved private API adapters"],
      nextStep: "Add public URL/upload analysis first.",
      safety: "Do not scrape private accounts.",
      healthChecks: [
        healthCheck("Public URL/upload adapter", "fail", "Public URL/upload analysis adapter is not wired yet."),
        healthCheck("Private platform gate", "pass", "Private account scraping is not claimed."),
      ],
    }),
  ];
}

export function summarizeProviderSetupReadiness(items: ProviderSetupReadiness[]): ProviderReadinessSummary {
  const readyOrPartialItems = items.filter((item) => item.status === "ready" || item.status === "partial");
  const setupItems = items.filter((item) => item.status === "needs_setup" || item.status === "needs_account" || item.status === "needs_adapter");
  const blockedItems = items.filter((item) => item.status === "blocked");
  const approvalItems = items.filter((item) => item.status === "approval_required");
  const launchBlockers = items
    .filter((item) => item.status === "blocked" || item.healthChecks.some((check) => check.status === "fail"))
    .map((item) => `${item.label}: ${item.nextStep}`);

  return {
    total: items.length,
    readyOrPartial: readyOrPartialItems.length,
    needsSetup: setupItems.length,
    blocked: blockedItems.length,
    approvalRequired: approvalItems.length,
    connectedLabels: readyOrPartialItems.map((item) => item.label),
    setupLabels: setupItems.map((item) => item.label),
    blockedLabels: blockedItems.map((item) => item.label),
    launchBlockers,
  };
}

export function formatProviderHealthReport(items: ProviderSetupReadiness[]): string {
  const summary = summarizeProviderSetupReadiness(items);
  return [
    "Provider health",
    `Ready/partly ready: ${summary.connectedLabels.length ? summary.connectedLabels.join(", ") : "none"}`,
    `Needs setup/account/adapter: ${summary.setupLabels.length ? summary.setupLabels.join(", ") : "none"}`,
    `Blocked: ${summary.blockedLabels.length ? summary.blockedLabels.join(", ") : "none"}`,
    "Checks:",
    ...items.map((item) => {
      const failing = item.healthChecks.filter((check) => check.status === "fail").length;
      const warnings = item.healthChecks.filter((check) => check.status === "warn").length;
      return `- ${item.label}: ${item.status.replace(/_/g, " ")}; ${failing} fail, ${warnings} warn; next: ${item.nextStep}`;
    }),
  ].join("\n");
}
