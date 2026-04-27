// Microsoft Graph OAuth via device code flow.
// Easier than redirect â€” works headless on any device.
//
// Requires env vars:
//   MS_CLIENT_ID       â€” from Azure App Registration
//   MS_TENANT_ID       â€” usually "common" for multi-tenant, or specific tenant ID
//
// Stores tokens at google-style path: ms-token.json (or env MS_TOKEN_JSON for cloud)

import { config as dotenvConfig } from "dotenv";
import { resolve as resolvePath } from "node:path";
dotenvConfig({ path: resolvePath(process.cwd(), "../../.env.local") });

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
  if (!tokens) throw new Error("No MS tokens â€” run pnpm ms:auth first");
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