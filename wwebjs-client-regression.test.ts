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

  test("prints WhatsApp QR pairing payloads only behind an explicit recovery switch", () => {
    expect(source).toContain("NITSYCLAW_PRINT_QR_TO_LOGS");
    expect(source).toContain('process.env.NITSYCLAW_PRINT_QR_TO_LOGS === "1"');
    expect(source).not.toContain('process.env.NODE_ENV !== "production"');
    expect(source).not.toContain("api.qrserver.com");
    expect(source).toContain("QR payload hidden");
    expect(source).toContain("active WhatsApp recovery window");
  });

  test("redacts runtime status reasons before they can reach heartbeat metadata", () => {
    expect(source).toContain("redactAuditString");
    expect(source).toContain("safeRuntimeReason");
    expect(source).toContain("safeRestartReason");
    expect(source).toContain("formatSafeLogError");
    expect(source).toContain("reason: safeRuntimeReason(event.reason)");
    expect(source).not.toContain("String(e)");
    expect(source).not.toContain("String(err)");
  });

  test("sends a safe WhatsApp fallback when backend handling crashes", () => {
    expect(source).toContain("WHATSAPP_HANDLER_FAILURE_REPLY");
    expect(source).toContain("sendHandlerFailureReply");
    expect(source).toContain("canSendFailureReply = true");
    expect(source).toContain('logBotError("[wwebjs] handler failure fallback send failed", fallbackError)');
  });
});
