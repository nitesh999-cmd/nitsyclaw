export type WhatsAppProviderReadinessKey =
  | "gmail"
  | "outlook"
  | "drive"
  | "onedrive"
  | "google-photos"
  | "spotify"
  | "bank-feeds"
  | "phone-sms"
  | "birthdays"
  | "social-video";

export type WhatsAppProviderReadinessStatus =
  | "ready"
  | "partial"
  | "needs_account"
  | "needs_setup"
  | "needs_adapter"
  | "approval_required";

export interface WhatsAppProviderReadiness {
  key: WhatsAppProviderReadinessKey;
  label: string;
  status: WhatsAppProviderReadinessStatus;
  reason: string;
  nextStep: string;
}

export interface WhatsAppProviderRuntimeSignals {
  spotifyConnected?: boolean;
  spotifyExpiresAt?: Date | string | null;
}

type EnvLike = Record<string, string | undefined>;

function has(env: EnvLike, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function hasAnyPrefix(env: EnvLike, prefix: string): boolean {
  return Object.keys(env).some((key) => key.startsWith(prefix) && Boolean(env[key]?.trim()));
}

function hasGoogleToken(env: EnvLike): boolean {
  return has(env, "GOOGLE_TOKEN_JSON") || hasAnyPrefix(env, "GOOGLE_TOKEN_JSON_");
}

function hasGoogleCredentials(env: EnvLike): boolean {
  return has(env, "GOOGLE_CREDENTIALS_JSON");
}

function hasMicrosoftToken(env: EnvLike): boolean {
  return has(env, "MS_TOKEN_JSON");
}

function hasMicrosoftClient(env: EnvLike): boolean {
  return has(env, "MS_CLIENT_ID");
}

function hasSpotifyApp(env: EnvLike): boolean {
  return has(env, "SPOTIFY_CLIENT_ID") && has(env, "SPOTIFY_CLIENT_SECRET") && has(env, "SPOTIFY_REDIRECT_URI");
}

function readiness(
  key: WhatsAppProviderReadinessKey,
  label: string,
  status: WhatsAppProviderReadinessStatus,
  reason: string,
  nextStep: string,
): WhatsAppProviderReadiness {
  return { key, label, status, reason, nextStep };
}

export function getWhatsAppProviderReadiness(
  env: EnvLike = process.env,
  signals: WhatsAppProviderRuntimeSignals = {},
): Record<WhatsAppProviderReadinessKey, WhatsAppProviderReadiness> {
  const googleToken = hasGoogleToken(env);
  const googleCredentials = hasGoogleCredentials(env);
  const microsoftToken = hasMicrosoftToken(env);
  const microsoftClient = hasMicrosoftClient(env);
  const spotifyApp = hasSpotifyApp(env);
  const spotifyExpiry = formatExpiry(signals.spotifyExpiresAt);

  return {
    gmail: googleToken
      ? readiness("gmail", "Gmail", "partial", "Google token detected; read/search can work where scopes are healthy.", "Keep draft/send actions confirmation-gated and verify token health before promising live mailbox action.")
      : googleCredentials
        ? readiness("gmail", "Gmail", "needs_account", "Google OAuth app credentials exist, but no account token is detected.", "Run the Google auth flow and connect the mailbox account.")
        : readiness("gmail", "Gmail", "needs_setup", "No Google OAuth credentials or account token detected.", "Create Google OAuth credentials, then connect the mailbox account."),
    outlook: microsoftToken
      ? readiness("outlook", "Outlook", "partial", "Microsoft token detected; Graph reads/calendar can work where scopes are healthy.", "Keep draft/send actions confirmation-gated and verify token health before promising live Outlook action.")
      : microsoftClient
        ? readiness("outlook", "Outlook", "needs_account", "Microsoft app registration is present, but no account token is detected.", "Run the Microsoft device-code auth flow and connect the Outlook account.")
        : readiness("outlook", "Outlook", "needs_setup", "No Microsoft client id or account token detected.", "Create an Azure app registration, then connect the Outlook account."),
    drive: googleToken
      ? readiness("drive", "Google Drive", "needs_adapter", "Google account token exists, but Drive selected-file adapter/scopes are not wired in WhatsApp.", "Add selected-file Drive picker/scopes before browsing Drive from WhatsApp.")
      : readiness("drive", "Google Drive", "needs_setup", "Drive has no connected Google account in this runtime.", "Connect Google OAuth and add selected-file Drive permissions."),
    onedrive: microsoftToken
      ? readiness("onedrive", "OneDrive", "needs_adapter", "Microsoft token exists, but OneDrive selected-file adapter is not wired in WhatsApp.", "Add selected-file OneDrive adapter before browsing OneDrive from WhatsApp.")
      : readiness("onedrive", "OneDrive", "needs_setup", "OneDrive has no connected Microsoft account in this runtime.", "Connect Microsoft OAuth and add selected-file OneDrive permissions."),
    "google-photos": googleToken
      ? readiness("google-photos", "Google Photos", "needs_adapter", "Google token exists, but Photos picker/API flow is not wired.", "Build selected-media Photos picker/import before claiming photo-library search.")
      : readiness("google-photos", "Google Photos", "needs_setup", "No Google account token detected for Photos.", "Connect Google OAuth, then add Photos picker/API consent."),
    spotify: signals.spotifyConnected
      ? readiness("spotify", "Spotify", "partial", `Spotify account token is stored${spotifyExpiry}.`, "Use read/search carefully; playlist creation still needs confirmation.")
      : spotifyApp
        ? readiness("spotify", "Spotify", "needs_account", "Spotify OAuth app is configured; user account connection is still required before live playlist actions.", "Open the Spotify connect flow and store the connected account token.")
        : readiness("spotify", "Spotify", "needs_setup", "Spotify OAuth app env vars are incomplete.", "Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI."),
    "bank-feeds": readiness("bank-feeds", "Bank feeds", "needs_setup", "No compliant bank-feed provider is configured.", "Pick a bank-data provider and build consent, retry, dedupe, and import rules."),
    "phone-sms": readiness("phone-sms", "Phone/SMS", "approval_required", "Drafts work; real sending/calling is intentionally blocked.", "Choose a compliant provider or phone companion app, then keep wrong-recipient confirmation gates."),
    birthdays: readiness("birthdays", "Birthdays", "needs_setup", "No lawful birthday source is connected.", "Start with manual/CSV/contact import before platform scraping or private social access."),
    "social-video": readiness("social-video", "Social video", "needs_adapter", "Public URL analysis can be queued; private platform adapters are not wired.", "Add public URL/upload analysis first, then approved APIs for private accounts."),
  };
}

function formatExpiry(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `; expires ${date.toISOString().slice(0, 16).replace("T", " ")}`;
}

function statusLabel(status: WhatsAppProviderReadinessStatus): string {
  switch (status) {
    case "ready":
      return "ready";
    case "partial":
      return "partly ready";
    case "needs_account":
      return "needs account connection";
    case "needs_setup":
      return "needs setup";
    case "needs_adapter":
      return "needs adapter";
    case "approval_required":
      return "approval required";
  }
}

export function formatProviderReadinessLine(item: WhatsAppProviderReadiness): string {
  return `${item.label} (${statusLabel(item.status)}): ${item.reason} Next: ${item.nextStep}`;
}

export function formatProviderReadinessShortLine(item: WhatsAppProviderReadiness): string {
  const detail = item.status === "partial" || item.status === "ready" ? item.reason : item.nextStep;
  return `${item.label}: ${statusLabel(item.status)} - ${clip(detail)}`;
}

function clip(value: string, max = 130): string {
  return value.length > max ? `${value.slice(0, max - 3).trim()}...` : value;
}
