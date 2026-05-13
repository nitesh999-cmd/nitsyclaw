import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import qrcode from "qrcode";

const DEFAULT_MAX_WINDOW_MS = 2 * 60 * 60 * 1000;
const DEFAULT_QR_TTL_MS = 2 * 60 * 1000;
const MIN_TOKEN_LENGTH = 24;

export interface QrRecoveryEnv {
  [key: string]: string | undefined;
  NITSYCLAW_QR_RECOVERY_TOKEN?: string;
  NITSYCLAW_QR_RECOVERY_UNTIL?: string;
  NITSYCLAW_QR_RECOVERY_MAX_WINDOW_MS?: string;
  PORT?: string;
}

export interface QrRecoveryWindow {
  enabled: boolean;
  reason?: string;
  token?: string;
  until?: Date;
}

interface QrPayloadState {
  payload: string;
  receivedAt: Date;
}

interface RenderResult {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readQrRecoveryWindow(
  env: QrRecoveryEnv = process.env,
  now: Date = new Date(),
): QrRecoveryWindow {
  const token = env.NITSYCLAW_QR_RECOVERY_TOKEN?.trim();
  const untilRaw = env.NITSYCLAW_QR_RECOVERY_UNTIL?.trim();
  if (!token && !untilRaw) return { enabled: false, reason: "not_configured" };
  if (!token || token.length < MIN_TOKEN_LENGTH) {
    return { enabled: false, reason: "token_missing_or_too_short" };
  }
  if (!untilRaw) return { enabled: false, reason: "until_missing" };

  const untilMs = Date.parse(untilRaw);
  if (!Number.isFinite(untilMs)) return { enabled: false, reason: "until_invalid" };

  const until = new Date(untilMs);
  if (until.getTime() <= now.getTime()) {
    return { enabled: false, reason: "window_expired", until };
  }

  const maxWindowMs = parsePositiveInt(
    env.NITSYCLAW_QR_RECOVERY_MAX_WINDOW_MS,
    DEFAULT_MAX_WINDOW_MS,
  );
  if (until.getTime() - now.getTime() > maxWindowMs) {
    return { enabled: false, reason: "window_too_long", until };
  }

  return { enabled: true, token, until };
}

export function safeTokenEquals(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

export class QrRecoveryController {
  private latestQr: QrPayloadState | null = null;

  constructor(
    private readonly env: QrRecoveryEnv = process.env,
    private readonly qrTtlMs = DEFAULT_QR_TTL_MS,
  ) {}

  setQr(payload: string, now: Date = new Date()): void {
    const window = readQrRecoveryWindow(this.env, now);
    if (!window.enabled) {
      this.latestQr = null;
      return;
    }
    this.latestQr = { payload, receivedAt: now };
    console.log("[qr-recovery] WhatsApp QR is available on the protected recovery endpoint.");
  }

  clearQr(): void {
    this.latestQr = null;
  }

  async renderSvg(token: string | null, now: Date = new Date()): Promise<RenderResult> {
    const window = readQrRecoveryWindow(this.env, now);
    if (!window.enabled || !window.token) {
      return {
        status: 404,
        contentType: "text/plain; charset=utf-8",
        body: "QR recovery is not enabled.",
      };
    }
    if (!safeTokenEquals(window.token, token)) {
      return {
        status: 403,
        contentType: "text/plain; charset=utf-8",
        body: "Invalid recovery token.",
      };
    }
    if (!this.latestQr) {
      return {
        status: 409,
        contentType: "text/plain; charset=utf-8",
        body: "No WhatsApp QR is currently available. Restart the bot to request a fresh QR.",
      };
    }
    if (now.getTime() - this.latestQr.receivedAt.getTime() > this.qrTtlMs) {
      return {
        status: 410,
        contentType: "text/plain; charset=utf-8",
        body: "This WhatsApp QR expired. Restart the bot and load the newest QR.",
      };
    }

    const svg = await qrcode.toString(this.latestQr.payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
    });
    return { status: 200, contentType: "image/svg+xml; charset=utf-8", body: svg };
  }
}

function send(res: ServerResponse, result: RenderResult): void {
  res.writeHead(result.status, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": result.contentType,
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...(result.headers ?? {}),
  });
  res.end(result.body);
}

function recoveryTokenFromRequest(req: IncomingMessage): string | null {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

function recoveryHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>NitsyClaw WhatsApp Recovery</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f3ea; color: #17130f; }
    main { width: min(92vw, 560px); padding: 28px; border: 1px solid #ded6c7; background: #fffdf7; }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { color: #5e574d; line-height: 1.5; }
    label { display: block; margin-top: 18px; font-weight: 650; }
    input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 12px; font: inherit; border: 1px solid #cfc6b6; }
    button { margin-top: 14px; padding: 11px 16px; font: inherit; border: 0; color: white; background: #17130f; cursor: pointer; }
    #qr { margin-top: 22px; display: grid; place-items: center; min-height: 180px; background: white; border: 1px solid #ded6c7; }
    #qr svg { width: min(82vw, 420px); height: auto; }
    #status { margin-top: 12px; min-height: 22px; color: #6b3d00; }
  </style>
</head>
<body>
  <main>
    <h1>WhatsApp recovery</h1>
    <p>Enter the short-lived recovery token from the Railway helper. The token is sent as an Authorization header, not stored in the URL.</p>
    <label for="token">Recovery token</label>
    <input id="token" autocomplete="off" spellcheck="false">
    <button id="load" type="button">Load QR</button>
    <div id="status"></div>
    <div id="qr" aria-live="polite"></div>
  </main>
  <script>
    const button = document.getElementById("load");
    const token = document.getElementById("token");
    const status = document.getElementById("status");
    const qr = document.getElementById("qr");
    button.addEventListener("click", async () => {
      status.textContent = "Loading fresh QR...";
      qr.textContent = "";
      try {
        const response = await fetch("/recovery/whatsapp-qr.svg", {
          cache: "no-store",
          headers: { Authorization: "Bearer " + token.value.trim() },
        });
        const body = await response.text();
        if (!response.ok) {
          status.textContent = body || "Could not load QR.";
          return;
        }
        qr.innerHTML = body;
        status.textContent = "Scan this QR now from WhatsApp Linked devices.";
      } catch {
        status.textContent = "Could not reach the recovery endpoint.";
      }
    });
  </script>
</body>
</html>`;
}

export function startQrRecoveryServer(
  controller: QrRecoveryController,
  env: QrRecoveryEnv = process.env,
): Server | null {
  const port = Number(env.PORT);
  if (!Number.isFinite(port) || port < 0) return null;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/healthz") {
      send(res, { status: 200, contentType: "text/plain; charset=utf-8", body: "ok" });
      return;
    }
    if (url.pathname === "/recovery/whatsapp-qr") {
      send(res, {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: recoveryHtml(),
        headers: {
          "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
      return;
    }
    if (url.pathname === "/recovery/whatsapp-qr.svg") {
      void controller
        .renderSvg(recoveryTokenFromRequest(req))
        .then((result) => send(res, result))
        .catch(() => send(res, {
          status: 500,
          contentType: "text/plain; charset=utf-8",
          body: "Could not render WhatsApp QR.",
        }));
      return;
    }
    send(res, { status: 404, contentType: "text/plain; charset=utf-8", body: "Not found" });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[qr-recovery] HTTP recovery server listening on port ${port}`);
  });
  return server;
}
