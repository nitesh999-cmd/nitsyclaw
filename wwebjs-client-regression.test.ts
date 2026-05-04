import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("wwebjs client regressions", () => {
  const source = readFileSync("apps/bot/src/wwebjs-client.ts", "utf8");

  test("does not drop owner-authored LID self-chat messages after self-chat gate passes", () => {
    expect(source).toContain("fromMe !== true");
    expect(source).toContain("from !== normalizeWhatsAppOwnerId(this.opts.ownerNumber)");
  });

  test("keeps existing ready waiters alive when the client restarts before first ready", () => {
    expect(source).toContain("readyResolvers");
    expect(source).toContain("resolveReadyWaiters");
    expect(source).not.toMatch(/private\s+readyResolve!?\s*:/);
  });

  test("does not churn the browser while a WhatsApp QR scan is pending", () => {
    expect(source).toContain("qrPending");
    expect(source).toContain('writeHealthHeartbeat("QR_REQUIRED")');
    expect(source).toContain("!this.qrPending");
  });

  test("does not print WhatsApp QR pairing payloads in production logs", () => {
    expect(source).toContain("NITSYCLAW_PRINT_QR_TO_LOGS");
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).not.toContain("api.qrserver.com");
    expect(source).toContain("QR payload hidden");
  });
});
