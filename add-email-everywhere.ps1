# Adds multi-Gmail, Yahoo IMAP, and Microsoft 365 email aggregation to NitsyClaw.
# After running, you do 3 small auth flows (one per service) to actually wire your accounts.
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\add-email-everywhere.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Adding multi-account email + calendar" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 1. UPDATED google-auth.ts — supports multiple Google accounts
# ============================================================
$googleAuth = @'
import { OAuth2Client } from "google-auth-library";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const ROOT = resolve(process.cwd(), "../..");
const CREDS_PATH = resolve(ROOT, "google-credentials.json");

interface CredsFile {
  installed: { client_id: string; client_secret: string; redirect_uris: string[] };
}

function loadCreds(): CredsFile {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  if (existsSync(CREDS_PATH)) {
    return JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
  }
  throw new Error("No Google credentials. Set GOOGLE_CREDENTIALS_JSON or put google-credentials.json at repo root.");
}

/**
 * Returns the list of Google account labels we have tokens for.
 * Tokens live as google-token-<label>.json (label = "personal", "solarharbour", etc.)
 * Legacy: google-token.json is treated as label "personal".
 */
export function listGoogleAccounts(): string[] {
  const labels: string[] = [];
  // Cloud env override: GOOGLE_TOKEN_JSON_<label>=...
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("GOOGLE_TOKEN_JSON_")) labels.push(k.replace("GOOGLE_TOKEN_JSON_", "").toLowerCase());
  }
  // Local file: google-token-<label>.json
  if (existsSync(ROOT)) {
    for (const f of readdirSync(ROOT)) {
      const m = f.match(/^google-token-([a-z0-9_-]+)\.json$/i);
      if (m) labels.push(m[1].toLowerCase());
    }
    // Legacy single-account file = "personal"
    if (existsSync(resolve(ROOT, "google-token.json")) && !labels.includes("personal")) {
      labels.push("personal");
    }
    // Cloud single-token env var = "personal"
    if (process.env.GOOGLE_TOKEN_JSON && !labels.includes("personal")) {
      labels.push("personal");
    }
  }
  return Array.from(new Set(labels));
}

function tokenPathFor(label: string): string {
  return resolve(ROOT, `google-token-${label}.json`);
}

function loadTokenFor(label: string): Record<string, unknown> | null {
  const envKey = `GOOGLE_TOKEN_JSON_${label.toUpperCase()}`;
  if (process.env[envKey]) return JSON.parse(process.env[envKey] as string);
  if (label === "personal" && process.env.GOOGLE_TOKEN_JSON) return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
  const path = tokenPathFor(label);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  // Legacy fallback
  if (label === "personal") {
    const legacy = resolve(ROOT, "google-token.json");
    if (existsSync(legacy)) return JSON.parse(readFileSync(legacy, "utf-8"));
  }
  return null;
}

const cachedClients = new Map<string, OAuth2Client>();

export function loadOAuthClient(label = "personal"): OAuth2Client {
  if (cachedClients.has(label)) return cachedClients.get(label)!;
  const creds = loadCreds();
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const client = new OAuth2Client(client_id, client_secret, redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob");

  const token = loadTokenFor(label);
  if (token) {
    client.setCredentials(token);
    client.on("tokens", (newTokens) => {
      const merged = { ...token, ...newTokens };
      const path = tokenPathFor(label);
      if (existsSync(path)) writeFileSync(path, JSON.stringify(merged, null, 2));
    });
  }
  cachedClients.set(label, client);
  return client;
}

export function hasGoogleToken(label = "personal"): boolean {
  return Boolean(loadTokenFor(label));
}

export async function runFirstTimeAuth(label?: string): Promise<void> {
  const accountLabel = (label || process.argv[2] || "personal").toLowerCase();
  console.log(`\n=== NitsyClaw Google OAuth — account label: "${accountLabel}" ===\n`);

  const creds = loadCreds();
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const client = new OAuth2Client(client_id, client_secret, redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob");

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("1. Open this URL in your browser:\n");
  console.log(url);
  console.log("\n2. Sign in with the Google account you want to label '" + accountLabel + "'.");
  console.log("3. After approval, browser redirects to a localhost URL — copy the 'code' value from the URL bar.");
  console.log("4. Paste it below and press Enter.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise((res) =>
    rl.question("Code: ", (a) => { rl.close(); res(a.trim()); })
  );

  const { tokens } = await client.getToken(code);
  const path = tokenPathFor(accountLabel);
  writeFileSync(path, JSON.stringify(tokens, null, 2));
  console.log(`\nToken saved to ${path}`);
  console.log(`This account is now labeled: "${accountLabel}"`);
  console.log(`\nList all linked Google accounts: pnpm google:list\n`);
}

if (process.argv[1]?.endsWith("google-auth.ts") || process.argv[1]?.endsWith("google-auth.js")) {
  runFirstTimeAuth().catch((e) => {
    console.error("OAuth error:", e);
    process.exit(1);
  });
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\google-auth.ts", $googleAuth, $enc)
Write-Host "  [1/6] Updated google-auth.ts — multi-account support" -ForegroundColor Green

# ============================================================
# 2. NEW yahoo-imap.ts — Yahoo Mail via IMAP + app password
# ============================================================
$yahoo = @'
// Yahoo Mail fetcher via IMAP (Yahoo doesn't support OAuth for 3rd party apps reliably).
// Requires YAHOO_EMAIL + YAHOO_APP_PASSWORD env vars.

import { ImapFlow } from "imapflow";

export interface UnreadEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
}

export async function fetchYahooUnread(limit = 5): Promise<UnreadEmail[]> {
  const email = process.env.YAHOO_EMAIL;
  const password = process.env.YAHOO_APP_PASSWORD;
  if (!email || !password) return [];

  const client = new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const out: UnreadEmail[] = [];
    try {
      const messages = client.fetch({ seen: false }, { envelope: true, internalDate: true });
      for await (const msg of messages) {
        if (out.length >= limit) break;
        const env = msg.envelope;
        if (!env) continue;
        const from = env.from?.[0]?.address ?? "(unknown)";
        out.push({
          source: `Yahoo (${email})`,
          from,
          subject: env.subject ?? "(no subject)",
          date: msg.internalDate ?? env.date ?? new Date(),
        });
      }
    } finally {
      lock.release();
    }
    return out;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\yahoo-imap.ts", $yahoo, $enc)
Write-Host "  [2/6] Created yahoo-imap.ts" -ForegroundColor Green

# ============================================================
# 3. NEW microsoft-auth.ts — M365 device-code OAuth
# ============================================================
$msAuth = @'
// Microsoft Graph OAuth via device code flow.
// Easier than redirect — works headless on any device.
//
// Requires env vars:
//   MS_CLIENT_ID       — from Azure App Registration
//   MS_TENANT_ID       — usually "common" for multi-tenant, or specific tenant ID
//
// Stores tokens at google-style path: ms-token.json (or env MS_TOKEN_JSON for cloud)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "../..");
const TOKEN_PATH = resolve(ROOT, "ms-token.json");

const SCOPES = [
  "Mail.Read",
  "Mail.ReadWrite",
  "Calendars.Read",
  "Calendars.ReadWrite",
  "User.Read",
  "offline_access",
];

interface MsTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export function hasMsToken(): boolean {
  return Boolean(process.env.MS_TOKEN_JSON) || existsSync(TOKEN_PATH);
}

function loadMsTokens(): MsTokens | null {
  if (process.env.MS_TOKEN_JSON) return JSON.parse(process.env.MS_TOKEN_JSON);
  if (existsSync(TOKEN_PATH)) return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  return null;
}

function saveMsTokens(tokens: MsTokens): void {
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(): Promise<string> {
  const tokens = loadMsTokens();
  if (!tokens) throw new Error("No MS tokens — run pnpm ms:auth first");
  if (Date.now() < tokens.expires_at - 60_000) {
    return tokens.access_token; // still valid
  }
  const tenant = process.env.MS_TENANT_ID || "common";
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) throw new Error("MS_CLIENT_ID not set");

  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      scope: SCOPES.join(" "),
    }),
  });
  if (!resp.ok) throw new Error(`MS refresh failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const updated: MsTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type ?? "Bearer",
  };
  saveMsTokens(updated);
  return updated.access_token;
}

export async function getMsAccessToken(): Promise<string> {
  return refreshAccessToken();
}

/**
 * Device-code flow. User opens a URL, types a code, and we poll for the token.
 * Run via: pnpm ms:auth
 */
export async function runDeviceCodeAuth(): Promise<void> {
  const tenant = process.env.MS_TENANT_ID || "common";
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) {
    console.error("Set MS_CLIENT_ID (and MS_TENANT_ID) in .env.local first");
    console.error("Get them from Azure Portal > App Registrations > NitsyClaw");
    process.exit(1);
  }

  console.log("\n=== NitsyClaw Microsoft 365 OAuth ===\n");

  const codeResp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES.join(" "),
    }),
  });
  if (!codeResp.ok) {
    console.error(`Device code request failed: ${codeResp.status} ${await codeResp.text()}`);
    process.exit(1);
  }
  const codeData = await codeResp.json();

  console.log(`1. Open this URL in your browser:\n   ${codeData.verification_uri}\n`);
  console.log(`2. Enter this code:\n   ${codeData.user_code}\n`);
  console.log("3. Sign in with your Microsoft 365 (Wattage) account.");
  console.log("4. Approve the permissions.\n");
  console.log("Waiting for you to complete sign-in...");

  const interval = (codeData.interval ?? 5) * 1000;
  const expiresAt = Date.now() + (codeData.expires_in ?? 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval));
    const pollResp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: codeData.device_code,
      }),
    });
    const pollData = await pollResp.json();
    if (pollResp.ok && pollData.access_token) {
      const tokens: MsTokens = {
        access_token: pollData.access_token,
        refresh_token: pollData.refresh_token,
        expires_at: Date.now() + (pollData.expires_in ?? 3600) * 1000,
        token_type: pollData.token_type ?? "Bearer",
      };
      saveMsTokens(tokens);
      console.log(`\nToken saved to ${TOKEN_PATH}`);
      console.log("\nFor cloud deploys: copy ms-token.json contents into MS_TOKEN_JSON env var.\n");
      return;
    }
    if (pollData.error === "authorization_pending") continue;
    if (pollData.error === "slow_down") { await new Promise((r) => setTimeout(r, 5000)); continue; }
    console.error(`Auth failed: ${JSON.stringify(pollData)}`);
    process.exit(1);
  }
  console.error("Device code expired. Run again.");
  process.exit(1);
}

if (process.argv[1]?.endsWith("microsoft-auth.ts") || process.argv[1]?.endsWith("microsoft-auth.js")) {
  runDeviceCodeAuth().catch((e) => { console.error(e); process.exit(1); });
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\microsoft-auth.ts", $msAuth, $enc)
Write-Host "  [3/6] Created microsoft-auth.ts (device code flow)" -ForegroundColor Green

# ============================================================
# 4. NEW microsoft-graph.ts — fetch M365 mail + calendar
# ============================================================
$msGraph = @'
import { getMsAccessToken, hasMsToken } from "./microsoft-auth.js";

export interface MsEvent {
  title: string;
  start: Date;
  end: Date;
  location?: string;
}

export interface MsUnreadEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
}

async function graphGet(path: string): Promise<unknown> {
  const token = await getMsAccessToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Graph ${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function fetchMsEventsToday(timezone: string): Promise<MsEvent[]> {
  if (!hasMsToken()) return [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const path = `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=20`;
  try {
    const data = (await graphGet(path)) as { value: any[] };
    return (data.value ?? []).map((e) => ({
      title: e.subject ?? "(no title)",
      start: new Date(e.start?.dateTime ?? Date.now()),
      end: new Date(e.end?.dateTime ?? Date.now()),
      location: e.location?.displayName ?? undefined,
    }));
  } catch (err) {
    console.error("[ms-graph] events fetch failed:", err);
    return [];
  }
}

export async function fetchMsUnread(limit = 5): Promise<MsUnreadEmail[]> {
  if (!hasMsToken()) return [];
  const path = `/me/mailFolders/inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime desc&$top=${limit}&$select=from,subject,receivedDateTime,bodyPreview`;
  try {
    const data = (await graphGet(path)) as { value: any[] };
    return (data.value ?? []).map((m) => ({
      source: "Outlook",
      from: m.from?.emailAddress?.address ?? "(unknown)",
      subject: m.subject ?? "(no subject)",
      date: new Date(m.receivedDateTime ?? Date.now()),
      snippet: m.bodyPreview ?? undefined,
    }));
  } catch (err) {
    console.error("[ms-graph] mail fetch failed:", err);
    return [];
  }
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\microsoft-graph.ts", $msGraph, $enc)
Write-Host "  [4/6] Created microsoft-graph.ts" -ForegroundColor Green

# ============================================================
# 5. UPDATE adapters.ts — add multi-Gmail email fetcher + merge MS + Yahoo
#    (We append a new aggregator function rather than rewrite the whole file)
# ============================================================
$adaptersAddition = @'

// =====================================================================
// Multi-account email + calendar aggregation (Gmail + Outlook + Yahoo)
// =====================================================================

import { google as googleApi } from "googleapis";
import { listGoogleAccounts, loadOAuthClient as loadGoogleOAuthClient } from "./google-auth.js";
import { fetchMsEventsToday, fetchMsUnread, type MsEvent, type MsUnreadEmail } from "./microsoft-graph.js";
import { fetchYahooUnread, type UnreadEmail as YahooUnreadEmail } from "./yahoo-imap.js";

export interface AggregatedEmail {
  source: string;
  from: string;
  subject: string;
  date: Date;
  snippet?: string;
}

export interface AggregatedEvent {
  source: string;
  title: string;
  start: Date;
}

export async function fetchAllUnreadEmails(perAccountLimit = 5): Promise<AggregatedEmail[]> {
  const out: AggregatedEmail[] = [];

  // All linked Gmail accounts
  for (const label of listGoogleAccounts()) {
    try {
      const auth = loadGoogleOAuthClient(label);
      const gmail = googleApi.gmail({ version: "v1", auth });
      const list = await gmail.users.messages.list({
        userId: "me",
        q: "is:unread in:inbox",
        maxResults: perAccountLimit,
      });
      for (const msg of list.data.messages ?? []) {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers ?? [];
        const get = (n: string) => headers.find((h) => h.name === n)?.value ?? "";
        out.push({
          source: `Gmail (${label})`,
          from: get("From"),
          subject: get("Subject") || "(no subject)",
          date: new Date(get("Date") || Date.now()),
          snippet: detail.data.snippet ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[email] Gmail/${label} failed:`, err);
    }
  }

  // Microsoft 365 / Outlook
  try {
    const ms = await fetchMsUnread(perAccountLimit);
    out.push(...ms);
  } catch (err) {
    console.error("[email] M365 failed:", err);
  }

  // Yahoo
  try {
    const yh = await fetchYahooUnread(perAccountLimit);
    out.push(...yh);
  } catch (err) {
    console.error("[email] Yahoo failed:", err);
  }

  // Sort: most recent first
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

export async function fetchAllEventsToday(timezone: string): Promise<AggregatedEvent[]> {
  const out: AggregatedEvent[] = [];

  for (const label of listGoogleAccounts()) {
    try {
      const auth = loadGoogleOAuthClient(label);
      const cal = googleApi.calendar({ version: "v3", auth });
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const list = await cal.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        timeZone: timezone,
      });
      for (const e of list.data.items ?? []) {
        out.push({
          source: `Google (${label})`,
          title: e.summary ?? "(no title)",
          start: new Date(e.start?.dateTime ?? e.start?.date ?? Date.now()),
        });
      }
    } catch (err) {
      console.error(`[cal] Google/${label} failed:`, err);
    }
  }

  try {
    const ms = await fetchMsEventsToday(timezone);
    for (const e of ms) {
      out.push({ source: "Outlook", title: e.title, start: e.start });
    }
  } catch (err) {
    console.error("[cal] M365 failed:", err);
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}
'@
$adaptersPath = "$root\apps\bot\src\adapters.ts"
$existingAdapters = [System.IO.File]::ReadAllText($adaptersPath)
if ($existingAdapters -notmatch "fetchAllUnreadEmails") {
    [System.IO.File]::WriteAllText($adaptersPath, $existingAdapters + "`n" + $adaptersAddition, $enc)
    Write-Host "  [5/6] Appended multi-account aggregator to adapters.ts" -ForegroundColor Green
} else {
    Write-Host "  [5/6] adapters.ts already has aggregator (skipped)" -ForegroundColor Yellow
}

# ============================================================
# 6. UPDATE bot/package.json — add ms:auth + google:add scripts
# ============================================================
$botPkg = @'
{
  "name": "@nitsyclaw/bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p .",
    "typecheck": "tsc --noEmit",
    "google:auth": "tsx src/google-auth.ts",
    "ms:auth": "tsx src/microsoft-auth.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@nitsyclaw/shared": "workspace:*",
    "google-auth-library": "^9.14.0",
    "googleapis": "^144.0.0",
    "imapflow": "^1.0.179",
    "node-cron": "^3.0.3",
    "openai": "^4.68.0",
    "qrcode-terminal": "^0.12.0",
    "whatsapp-web.js": "^1.26.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\package.json", $botPkg, $enc)
Write-Host "  [6/6] Updated apps/bot/package.json" -ForegroundColor Green

# Install new deps
Write-Host ""
Write-Host "Installing new dependencies (imapflow)..." -ForegroundColor Yellow
Push-Location $root
try {
    pnpm install --no-frozen-lockfile 2>&1 | Out-String | Write-Host
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Code installed. Now do these in any order:" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 1. Add Solar Harbour Gmail (~5 min):" -ForegroundColor White
Write-Host "    cd $root" -ForegroundColor Yellow
Write-Host "    pnpm google:auth solarharbour" -ForegroundColor Yellow
Write-Host "    (Sign in with nitesh@solarharbour.com.au)" -ForegroundColor Gray
Write-Host ""
Write-Host " 2. Add Yahoo (~5 min):" -ForegroundColor White
Write-Host "    a. https://login.yahoo.com/account/security -> Generate app password" -ForegroundColor Gray
Write-Host "    b. Add to .env.local:" -ForegroundColor Gray
Write-Host "       YAHOO_EMAIL=`"your-yahoo-email`"" -ForegroundColor Yellow
Write-Host "       YAHOO_APP_PASSWORD=`"the-16-char-app-password`"" -ForegroundColor Yellow
Write-Host ""
Write-Host " 3. Add Microsoft 365 Wattage (~10 min):" -ForegroundColor White
Write-Host "    a. Complete Azure App Registration (see PARKED-TASKS.md)" -ForegroundColor Gray
Write-Host "    b. Add to .env.local:" -ForegroundColor Gray
Write-Host "       MS_CLIENT_ID=`"your-app-client-id`"" -ForegroundColor Yellow
Write-Host "       MS_TENANT_ID=`"common`"" -ForegroundColor Yellow
Write-Host "    c. Run: pnpm ms:auth" -ForegroundColor Yellow
Write-Host ""
Write-Host " 4. After ALL accounts wired, message me with:" -ForegroundColor White
Write-Host "       'merge all into morning brief'" -ForegroundColor Cyan
Write-Host "    and I'll wire 04-morning-brief.ts to use the new aggregator." -ForegroundColor White
Write-Host ""
Write-Host " The bot uses tsx watch, so any of these will hot-reload automatically." -ForegroundColor Gray
Write-Host ""
