import { describe, expect, test } from "vitest";
import { once } from "node:events";
import {
  QrRecoveryController,
  readQrRecoveryWindow,
  safeTokenEquals,
  startQrRecoveryServer,
} from "./qr-recovery-server";

const TOKEN = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-05-14T00:00:00.000Z");

describe("QR recovery server", () => {
  test("requires both a strong token and a short future recovery window", () => {
    expect(readQrRecoveryWindow({}, NOW)).toMatchObject({
      enabled: false,
      reason: "not_configured",
    });
    expect(readQrRecoveryWindow({
      NITSYCLAW_QR_RECOVERY_TOKEN: "short",
      NITSYCLAW_QR_RECOVERY_UNTIL: "2026-05-14T00:10:00.000Z",
    }, NOW)).toMatchObject({
      enabled: false,
      reason: "token_missing_or_too_short",
    });
    expect(readQrRecoveryWindow({
      NITSYCLAW_QR_RECOVERY_TOKEN: TOKEN,
      NITSYCLAW_QR_RECOVERY_UNTIL: "2026-05-14T03:00:00.000Z",
    }, NOW)).toMatchObject({
      enabled: false,
      reason: "window_too_long",
    });
    expect(readQrRecoveryWindow({
      NITSYCLAW_QR_RECOVERY_TOKEN: TOKEN,
      NITSYCLAW_QR_RECOVERY_UNTIL: "2026-05-14T00:20:00.000Z",
    }, NOW)).toMatchObject({
      enabled: true,
      token: TOKEN,
    });
  });

  test("uses constant-time token comparison with exact lengths", () => {
    expect(safeTokenEquals(TOKEN, TOKEN)).toBe(true);
    expect(safeTokenEquals(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(safeTokenEquals(TOKEN, TOKEN.replace("a", "b"))).toBe(false);
    expect(safeTokenEquals(TOKEN, null)).toBe(false);
  });

  test("serves only fresh QR SVGs with a valid token", async () => {
    const env = {
      NITSYCLAW_QR_RECOVERY_TOKEN: TOKEN,
      NITSYCLAW_QR_RECOVERY_UNTIL: "2026-05-14T00:20:00.000Z",
    };
    const controller = new QrRecoveryController(env, 60_000);

    expect((await controller.renderSvg(TOKEN, NOW)).status).toBe(409);

    const payload = "1@sample-whatsapp-pairing-payload";
    controller.setQr(payload, NOW);

    const invalid = await controller.renderSvg("wrong-token", NOW);
    expect(invalid.status).toBe(403);

    const valid = await controller.renderSvg(TOKEN, NOW);
    expect(valid.status).toBe(200);
    expect(valid.contentType).toContain("image/svg+xml");
    expect(valid.body).toContain("<svg");
    expect(valid.body).not.toContain(payload);

    const stale = await controller.renderSvg(TOKEN, new Date(NOW.getTime() + 61_000));
    expect(stale.status).toBe(410);

    controller.clearQr();
    expect((await controller.renderSvg(TOKEN, NOW)).status).toBe(409);
  });

  test("HTTP recovery page keeps token out of the URL and sets no-store headers", async () => {
    const freshNow = new Date();
    const env = {
      PORT: "0",
      NITSYCLAW_QR_RECOVERY_TOKEN: TOKEN,
      NITSYCLAW_QR_RECOVERY_UNTIL: new Date(freshNow.getTime() + 10 * 60_000).toISOString(),
    };
    const controller = new QrRecoveryController(env, 60_000);
    controller.setQr("1@sample-whatsapp-pairing-payload", freshNow);
    const server = startQrRecoveryServer(controller, env);
    expect(server).toBeTruthy();
    await once(server!, "listening");
    const address = server!.address();
    if (!address || typeof address === "string") throw new Error("expected TCP test server");
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const page = await fetch(`${base}/recovery/whatsapp-qr`);
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toContain("no-store");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      const html = await page.text();
      expect(html).toContain("X-NitsyClaw-Recovery-Token");
      expect(html).not.toContain("?token=");

      const invalid = await fetch(`${base}/recovery/whatsapp-qr.svg?token=${TOKEN}`);
      expect(invalid.status).toBe(403);

      const svg = await fetch(`${base}/recovery/whatsapp-qr.svg`, {
        headers: { "X-NitsyClaw-Recovery-Token": TOKEN },
      });
      expect(svg.status).toBe(200);
      expect(svg.headers.get("content-type")).toContain("image/svg+xml");
      expect(svg.headers.get("x-robots-tag")).toContain("noindex");

      const bearerSvg = await fetch(`${base}/recovery/whatsapp-qr.svg`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(bearerSvg.status).toBe(200);
    } finally {
      server!.close();
    }
  });
});
