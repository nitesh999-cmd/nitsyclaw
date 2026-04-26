# Fixes the "Could not find Chrome" error on Railway by:
# 1. Installing Chromium via apt-get during nixpacks build phase
# 2. Telling Puppeteer to use system Chromium via PUPPETEER_EXECUTABLE_PATH
# 3. Updating wwebjs-client to honor PUPPETEER_EXECUTABLE_PATH from env
#
# Run: powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\fix-railway-chrome.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\Nitesh\projects\NitsyClaw"
$enc = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $root)) {
    Write-Host "ERROR: NitsyClaw not found at $root" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Fixing Railway Chrome issue..." -ForegroundColor Cyan
Write-Host ""

# 1. Update nixpacks.toml — install chromium + needed libs
$nixpacks = @'
# Railway/Nixpacks config for NitsyClaw bot
[phases.setup]
nixPkgs = ["nodejs_20", "pnpm", "chromium"]
aptPkgs = ["chromium", "ca-certificates", "fonts-liberation", "libnss3", "libxss1", "libgbm1", "libgtk-3-0", "libasound2", "libcups2", "libxkbcommon0", "libxshmfence1", "libdrm2"]

[phases.install]
cmds = ["pnpm install --no-frozen-lockfile"]

[phases.build]
cmds = ["echo no build needed"]

[start]
cmd = "pnpm --filter @nitsyclaw/bot start"

[variables]
PUPPETEER_SKIP_DOWNLOAD = "true"
PUPPETEER_EXECUTABLE_PATH = "/usr/bin/chromium"
'@
[System.IO.File]::WriteAllText("$root\nixpacks.toml", $nixpacks, $enc)
Write-Host "  [1/3] Updated nixpacks.toml to install chromium" -ForegroundColor Green

# 2. Update wwebjs-client.ts to honor PUPPETEER_EXECUTABLE_PATH if set
$wwebjsPath = "$root\apps\bot\src\wwebjs-client.ts"
$wwebjs = @'
// Concrete WhatsAppClient backed by whatsapp-web.js.
// This is the ONLY file that imports whatsapp-web.js (Constitution R16).

import wweb from "whatsapp-web.js";
const { Client, LocalAuth } = wweb;
type Message = wweb.Message;

import qrcode from "qrcode-terminal";
import type {
  InboundMessage,
  OutboundMessage,
  WhatsAppClient,
} from "@nitsyclaw/shared/whatsapp";

const PUPPETEER_ARGS = process.platform === "win32"
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  : ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"];

export interface WwebjsOptions {
  sessionDir: string;
  ownerNumber: string;
  onlyOwner?: boolean;
}

export class WwebjsClient implements WhatsAppClient {
  private recentOutgoingBodies: Array<{ body: string; sentAt: number }> = [];
  private client: Client;
  private handlers: Array<(m: InboundMessage) => Promise<void> | void> = [];
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  constructor(private opts: WwebjsOptions) {
    this.readyPromise = new Promise((res) => { this.readyResolve = res; });

    const puppeteerOpts: Record<string, unknown> = {
      headless: true,
      args: PUPPETEER_ARGS,
      handleSIGINT: false,
    };
    // If PUPPETEER_EXECUTABLE_PATH is set (Railway/Docker), use it
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: opts.sessionDir }),
      puppeteer: puppeteerOpts as never,
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023223821.html",
      },
    });
    this.wireEvents();
    this.client.initialize();
  }

  private isOurEcho(body: string): boolean {
    const now = Date.now();
    this.recentOutgoingBodies = this.recentOutgoingBodies.filter(e => now - e.sentAt < 60_000);
    const idx = this.recentOutgoingBodies.findIndex(e => e.body === body);
    if (idx >= 0) {
      this.recentOutgoingBodies.splice(idx, 1);
      return true;
    }
    return false;
  }

  private wireEvents(): void {
    this.client.on("qr", (qr) => {
      console.log("[wwebjs] QR code received - scan with your phone");
      qrcode.generate(qr, { small: true });
    });
    this.client.on("ready", () => {
      console.log("[wwebjs] client ready");
      this.readyResolve();
    });
    this.client.on("auth_failure", (err) => console.error("[wwebjs] auth_failure", err));
    this.client.on("disconnected", (reason) => console.error("[wwebjs] disconnected", reason));

    const handleMessage = async (m: Message) => {
      try {
        const body = m.body ?? "";
        const fromMe = (m as any).fromMe;

        if (fromMe && this.isOurEcho(body)) return;

        const fromRaw = (m as any).from ?? "";
        const from = fromRaw.replace(/@c\.us$/, "");

        console.log(`[wwebjs] inbound: from=${from} fromMe=${fromMe} body="${body.slice(0, 50)}"`);

        if (this.opts.onlyOwner !== false && from !== this.opts.ownerNumber) {
          console.log(`[wwebjs] dropped: from=${from} != owner=${this.opts.ownerNumber}`);
          return;
        }

        const inbound: InboundMessage = {
          id: m.id?._serialized ?? "",
          from: this.opts.ownerNumber,
          body,
          timestamp: new Date((m.timestamp ?? Date.now() / 1000) * 1000),
          hasMedia: m.hasMedia,
          mediaType: m.hasMedia
            ? (m.type === "ptt" || m.type === "audio")
              ? "voice"
              : m.type === "image"
                ? "image"
                : "document"
            : undefined,
          downloadMedia: m.hasMedia
            ? async () => {
                const media = await m.downloadMedia();
                return {
                  data: Buffer.from(media.data, "base64"),
                  mimetype: media.mimetype,
                  filename: media.filename ?? undefined,
                };
              }
            : undefined,
        };
        for (const h of this.handlers) await h(inbound);
      } catch (e) {
        console.error("[wwebjs] handler error", e);
      }
    };

    this.client.on("message", handleMessage);
    this.client.on("message_create", handleMessage);
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }

  async send(msg: OutboundMessage): Promise<{ id: string }> {
    this.recentOutgoingBodies.push({ body: msg.body, sentAt: Date.now() });
    const target = msg.to.includes("@") ? msg.to : `${msg.to}@c.us`;
    const sent = await this.client.sendMessage(target, msg.body);
    return { id: sent.id?._serialized ?? "" };
  }

  onMessage(handler: (m: InboundMessage) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}
'@
[System.IO.File]::WriteAllText($wwebjsPath, $wwebjs, $enc)
Write-Host "  [2/3] Updated wwebjs-client.ts to honor PUPPETEER_EXECUTABLE_PATH" -ForegroundColor Green

# 3. Stage and commit
Write-Host "  [3/3] Pushing to GitHub..." -ForegroundColor Yellow
Push-Location $root
try {
    git add nixpacks.toml apps/bot/src/wwebjs-client.ts 2>&1 | Out-String | Write-Host
    git commit -m "fix: install chromium for railway, use PUPPETEER_EXECUTABLE_PATH" 2>&1 | Out-String | Write-Host
    git push 2>&1 | Out-String | Write-Host
} finally {
    Pop-Location
}
Write-Host "  Pushed. Railway will auto-redeploy in ~30 seconds." -ForegroundColor Green

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host " Fix pushed. Now in Railway:" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 1. Watch Deploy Logs - new build will start automatically." -ForegroundColor White
Write-Host " 2. Wait ~3-5 min for Chromium to install during build." -ForegroundColor White
Write-Host " 3. Then look for QR code in logs." -ForegroundColor White
Write-Host " 4. Scan with phone (Settings - Linked Devices - Link a Device)." -ForegroundColor White
Write-Host ""
