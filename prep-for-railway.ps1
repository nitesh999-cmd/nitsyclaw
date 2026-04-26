# Prep NitsyClaw bot for Railway deploy.
# - Updates google-auth.ts to load creds from env vars (with file fallback)
# - Adds NixPacks config for Railway
# - Adds a Procfile so Railway auto-detects the start command
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\prep-for-railway.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Prepping for Railway deploy..." -ForegroundColor Cyan
Write-Host ""

# 1. Rewrite google-auth.ts to support env-var creds
$googleAuthContent = @'
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

function loadCreds(): CredsFile {
  // Cloud: load from env var GOOGLE_CREDENTIALS_JSON
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  // Local: load from file
  if (existsSync(CREDS_PATH)) {
    return JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
  }
  throw new Error("No Google credentials. Set GOOGLE_CREDENTIALS_JSON env var or put google-credentials.json at repo root.");
}

function loadToken(): Record<string, unknown> | null {
  // Cloud: load from env var GOOGLE_TOKEN_JSON
  if (process.env.GOOGLE_TOKEN_JSON) {
    return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
  }
  // Local: load from file
  if (existsSync(TOKEN_PATH)) {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  }
  return null;
}

export function loadOAuthClient(): OAuth2Client {
  if (cachedClient) return cachedClient;
  const creds = loadCreds();
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const client = new OAuth2Client(client_id, client_secret, redirect_uris[0] ?? "urn:ietf:wg:oauth:2.0:oob");

  const token = loadToken();
  if (token) {
    client.setCredentials(token);
    client.on("tokens", (newTokens) => {
      const merged = { ...token, ...newTokens };
      // Save back to disk if running locally; otherwise log warning
      if (existsSync(TOKEN_PATH)) {
        writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
      } else if (!process.env.GOOGLE_TOKEN_JSON) {
        console.warn("[google-auth] new tokens received but nowhere to persist them");
      }
    });
  }
  cachedClient = client;
  return client;
}

export function hasGoogleToken(): boolean {
  return Boolean(process.env.GOOGLE_TOKEN_JSON) || existsSync(TOKEN_PATH);
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
  console.log("3. After approval, Google shows a code on the screen - copy it.");
  console.log("4. Paste it below and press Enter.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise((res) =>
    rl.question("Code: ", (a) => { rl.close(); res(a.trim()); })
  );

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log("\nToken saved to " + TOKEN_PATH);
  console.log("\nFor Railway/Vercel deploy: copy the contents of google-token.json into");
  console.log("env var GOOGLE_TOKEN_JSON, and copy google-credentials.json into");
  console.log("env var GOOGLE_CREDENTIALS_JSON.\n");
}

if (process.argv[1]?.endsWith("google-auth.ts") || process.argv[1]?.endsWith("google-auth.js")) {
  runFirstTimeAuth().catch((e) => {
    console.error("OAuth error:", e);
    process.exit(1);
  });
}
'@
[System.IO.File]::WriteAllText("$root\apps\bot\src\google-auth.ts", $googleAuthContent, $enc)
Write-Host "  [1/4] Updated google-auth.ts to support env-var creds" -ForegroundColor Green

# 2. Add a Procfile for Railway
$procfileContent = "web: pnpm --filter @nitsyclaw/bot start`n"
[System.IO.File]::WriteAllText("$root\Procfile", $procfileContent, $enc)
Write-Host "  [2/4] Created Procfile for Railway" -ForegroundColor Green

# 3. Add a nixpacks.toml so Railway picks Node 20 and pnpm
$nixpacksContent = @'
# Railway/Nixpacks config for NitsyClaw bot
[phases.setup]
nixPkgs = ["nodejs_20", "pnpm"]

[phases.install]
cmds = ["pnpm install --no-frozen-lockfile"]

[phases.build]
cmds = ["echo no build needed"]

[start]
cmd = "pnpm --filter @nitsyclaw/bot start"
'@
[System.IO.File]::WriteAllText("$root\nixpacks.toml", $nixpacksContent, $enc)
Write-Host "  [3/4] Created nixpacks.toml" -ForegroundColor Green

# 4. Add a railway.json for explicit Railway config
$railwayContent = @'
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm --filter @nitsyclaw/bot start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
'@
[System.IO.File]::WriteAllText("$root\railway.json", $railwayContent, $enc)
Write-Host "  [4/4] Created railway.json" -ForegroundColor Green

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host " Prep done. Now:" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 1. Push to GitHub:" -ForegroundColor White
Write-Host "    cd C:\Users\Nitesh\projects\NitsyClaw" -ForegroundColor Yellow
Write-Host "    git add ." -ForegroundColor Yellow
Write-Host "    git commit -m `"chore: railway prep`"" -ForegroundColor Yellow
Write-Host "    git push" -ForegroundColor Yellow
Write-Host ""
Write-Host " 2. Then sign up at railway.com and continue per chat instructions." -ForegroundColor White
Write-Host ""
