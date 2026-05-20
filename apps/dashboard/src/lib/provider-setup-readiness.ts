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
}

export interface ProviderSetupSignals {
  spotifyConnected?: boolean;
  spotifyExpiresAt?: Date | string | null;
  spotifyHasRefreshToken?: boolean;
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

function readiness(input: ProviderSetupReadiness): ProviderSetupReadiness {
  return input;
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
          : "Google OAuth is not configured yet.",
      configured: [...configuredIf(googleCredentials, "Google OAuth app"), ...configuredIf(googleToken, "Google account token")],
      missing: googleToken ? [] : googleCredentials ? ["Google account token"] : ["GOOGLE_CREDENTIALS_JSON", "Google account token"],
      nextStep: googleToken ? "Verify Gmail scopes before claiming live mailbox action." : "Connect the Google mailbox account.",
      safety: "No email is sent without confirmation.",
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
          ? "Spotify OAuth app is configured. The account still needs connection."
          : "Spotify OAuth env vars are incomplete.",
      configured: [...configuredIf(spotifyApp, "Spotify OAuth app"), ...configuredIf(Boolean(signals.spotifyConnected), "Spotify account token")],
      missing: spotifyTokenProblem
        ? ["Fresh Spotify account token or refresh token"]
        : signals.spotifyConnected
          ? []
          : spotifyApp ? ["Spotify account token"] : ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"],
      nextStep: spotifyTokenProblem ? "Reconnect Spotify OAuth." : signals.spotifyConnected ? "Run a top-tracks proof." : "Connect Spotify OAuth.",
      safety: "Playlist creation stays confirmation-gated.",
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
    }),
  ];
}
