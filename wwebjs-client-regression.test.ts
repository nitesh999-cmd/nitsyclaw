import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("wwebjs client regressions", () => {
  const source = readFileSync("apps/bot/src/wwebjs-client.ts", "utf8");

  const gateSource = readFileSync("apps/bot/src/whatsapp-inbound-gate.ts", "utf8");
  const lidSource = readFileSync("apps/bot/src/whatsapp-lid-identity.ts", "utf8");

  test("does not drop owner-authored LID self-chat messages after self-chat gate passes", () => {
    expect(gateSource).toContain("envelope.fromMe !== true");
    expect(gateSource).toContain(
      "normalizeWhatsAppOwnerId(envelope.from) !== normalizeWhatsAppOwnerId(deps.ownerNumber)",
    );
    expect(source).toContain("decideInboundAction");
  });

  test("accepts an @lid self-chat only after the LID resolves to the owner number", () => {
    expect(source).toContain("getContactLidAndPhone");
    expect(lidSource).toContain("if (phone !== owner) return \"rejected_identity\"");
    expect(lidSource).toContain("return unresolved ? \"unresolved\" : \"accepted\"");
    expect(source).toContain("resolveLidSelfChat");
  });

  test("does not log message bodies, phone numbers, lids or message ids on inbound drops", () => {
    expect(source).not.toContain("id=${messageId}");
    expect(source).toContain("addressKind(ctx.to)");
    expect(source).not.toContain("to=${toRaw}");
    expect(source).not.toContain("from=${fromRaw}");
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
    expect(source).toContain("formatWhatsAppHandlerFailure");
    expect(source).toContain("createWhatsAppCorrelationId");
    expect(source).toContain("did not retry automatically");
    expect(source).toContain("sendHandlerFailureReply");
    expect(source).toContain("canSendFailureReply = true");
    expect(source).toContain('logBotError("[wwebjs] handler failure fallback send failed", fallbackError)');
  });

  test("clears only stale Chromium singleton locks before creating a browser client", () => {
    expect(source).toContain("CHROMIUM_SINGLETON_LOCK_FILES");
    expect(source).toContain("SingletonLock");
    expect(source).toContain("SingletonSocket");
    expect(source).toContain("SingletonCookie");
    expect(source).toContain("clearChromiumSingletonLocks(this.opts.sessionDir)");
    expect(source).toContain("cleared stale Chromium profile lock");
  });
});
