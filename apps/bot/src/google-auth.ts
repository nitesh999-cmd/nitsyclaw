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

if (process.argv[1]?.endsWith("google-auth.ts") || process.argv[1]?.endsWith("google-auth.js")) {
  runFirstTimeAuth().catch((e) => {
    console.error("OAuth error:", e);
    process.exit(1);
  });
}