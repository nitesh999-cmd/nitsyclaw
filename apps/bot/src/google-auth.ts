import { OAuth2Client } from "google-auth-library";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import * as readline from "node:readline";
import {
  firstExistingSecretPath,
  legacyRepoSecretPath,
  loadBotDotenv,
  secretRoot,
  writableSecretPath,
} from "./secret-paths.js";

loadBotDotenv();

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const CREDS_FILE = "google-credentials.json";

interface CredsFile {
  installed: { client_id: string; client_secret: string; redirect_uris: string[] };
}

function loadCreds(): CredsFile {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  const credentialsPath = firstExistingSecretPath(CREDS_FILE);
  if (credentialsPath) {
    return JSON.parse(readFileSync(credentialsPath, "utf-8"));
  }
  throw new Error(`No Google credentials. Set GOOGLE_CREDENTIALS_JSON or put ${CREDS_FILE} in ${secretRoot()}.`);
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
  for (const root of [secretRoot(), legacyRepoSecretPath(".")]) {
    if (!existsSync(root)) continue;
    for (const f of readdirSync(root)) {
      const m = f.match(/^google-token-([a-z0-9_-]+)\.json$/i);
      if (m && m[1]) labels.push(m[1].toLowerCase());
    }
    // Legacy single-account file = "personal"
    if (existsSync(`${root}/google-token.json`) && !labels.includes("personal")) {
      labels.push("personal");
    }
  }
  // Cloud single-token env var = "personal"
  if (process.env.GOOGLE_TOKEN_JSON && !labels.includes("personal")) {
    labels.push("personal");
  }
  return Array.from(new Set(labels));
}

function tokenPathFor(label: string): string {
  return writableSecretPath(`google-token-${label}.json`);
}

function loadTokenFor(label: string): Record<string, unknown> | null {
  const envKey = `GOOGLE_TOKEN_JSON_${label.toUpperCase()}`;
  if (process.env[envKey]) return JSON.parse(process.env[envKey] as string);
  if (label === "personal" && process.env.GOOGLE_TOKEN_JSON) return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
  const path = tokenPathFor(label);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  const legacyLabeled = legacyRepoSecretPath(`google-token-${label}.json`);
  if (existsSync(legacyLabeled)) return JSON.parse(readFileSync(legacyLabeled, "utf-8"));
  // Legacy fallback
  if (label === "personal") {
    const legacy = firstExistingSecretPath("google-token.json");
    if (legacy) return JSON.parse(readFileSync(legacy, "utf-8"));
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
  console.log(`\n=== NitsyClaw Google OAuth â€” account label: "${accountLabel}" ===\n`);

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
  console.log("3. After approval, browser redirects to a localhost URL â€” copy the 'code' value from the URL bar.");
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

/**
 * Provider-side revoke (Phase C trust trio). Calls Google's revocation
 * endpoint with the refresh_token (preferred) or access_token, then clears
 * the local token file regardless of revoke outcome so the user is always
 * disconnected locally. Returns structured result; never throws.
 *
 * https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 */
export async function revokeGoogleToken(
  label = "personal",
): Promise<{ revoked: boolean; cleared: boolean; reason?: string }> {
  const token = loadTokenFor(label);
  if (!token) return { revoked: false, cleared: false, reason: "no token for label" };
  const tokenToRevoke =
    (token.refresh_token as string | undefined) ??
    (token.access_token as string | undefined);
  let revoked = false;
  let reason: string | undefined;
  if (tokenToRevoke) {
    try {
      const resp = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      if (resp.ok) revoked = true;
      else reason = `revoke endpoint returned ${resp.status}`;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  } else {
    reason = "no access or refresh token to revoke";
  }
  const path = tokenPathFor(label);
  let cleared = false;
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      cleared = true;
    }
  } catch {
    // best-effort; cleared stays false
  }
  cachedClients.delete(label);
  return { revoked, cleared, reason };
}

if (process.argv[1]?.endsWith("google-auth.ts") || process.argv[1]?.endsWith("google-auth.js")) {
  runFirstTimeAuth().catch(() => {
    console.error("Google OAuth failed.");
    process.exit(1);
  });
}
