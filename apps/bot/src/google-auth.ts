import { OAuth2Client } from "google-auth-library";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
const TOKEN_PATH = resolve(ROOT, "google-token.json");

interface CredsFile {
  installed: { client_id: string; client_secret: string; redirect_uris: string[] };
}

let cachedClient: OAuth2Client | null = null;

export function loadOAuthClient(): OAuth2Client {
  if (cachedClient) return cachedClient;
  if (!existsSync(CREDS_PATH)) {
    throw new Error("google-credentials.json not found at " + CREDS_PATH);
  }
  const creds: CredsFile = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const client = new OAuth2Client(client_id, client_secret, redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob");

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    client.setCredentials(token);
    client.on("tokens", (tokens) => {
      const merged = { ...token, ...tokens };
      writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });
  }
  cachedClient = client;
  return client;
}

export function hasGoogleToken(): boolean {
  return existsSync(TOKEN_PATH);
}

export async function runFirstTimeAuth(): Promise<void> {
  const client = loadOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("\n=== NitsyClaw Google OAuth ===\n");
  console.log("1. Open this URL in your browser:\n");
  console.log(url);
  console.log("\n2. Sign in with the Google account NitsyClaw should access.");
  console.log("3. After approval, Google shows a code on the screen — copy it.");
  console.log("4. Paste it below and press Enter.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise((res) =>
    rl.question("Code: ", (a) => { rl.close(); res(a.trim()); })
  );

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("\nToken saved to " + TOKEN_PATH + "\n");
}

if (process.argv[1]?.endsWith("google-auth.ts") || process.argv[1]?.endsWith("google-auth.js")) {
  runFirstTimeAuth().catch((e) => {
    console.error("OAuth error:", e);
    process.exit(1);
  });
}
