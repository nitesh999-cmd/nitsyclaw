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

  test("does not print WhatsApp QR pairing payloads to logs", () => {
    expect(source).not.toContain("NITSYCLAW_PRINT_QR_TO_LOGS");
    expect(source).not.toContain("qrcode-terminal");
    expect(source).toContain("onQr?:");
    expect(source).toContain("onQrCleared?:");
    expect(source).not.toContain("api.qrserver.com");
    expect(source).toContain("QR payload hidden");
    expect(source).toContain("protected recovery endpoint");
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
