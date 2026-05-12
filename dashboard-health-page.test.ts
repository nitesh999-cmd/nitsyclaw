import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard health page", () => {
  test("surfaces WhatsApp client heartbeat from the database", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-client")');
    expect(source).toContain("WhatsApp client");
    expect(source).toContain("whatsappFreshness");
  });

  test("surfaces WhatsApp send failure telemetry from the database", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-send")');
    expect(source).toContain("WhatsApp replies");
    expect(source).toContain("whatsappSendFreshness");
    expect(source).toContain("Last send failure");
  });

  test("surfaces WhatsApp loop breaker telemetry from the database", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "whatsapp-loop-guard")');
    expect(source).toContain("WhatsApp loop guard");
    expect(source).toContain("whatsappLoopGuardFreshness");
    expect(source).toContain("Loop guard reason");
    expect(source).toContain("Auto-reset");
  });

  test("surfaces command job backlog and WhatsApp phone proof checklist", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("commandJobs");
    expect(source).toContain("Command jobs");
    expect(source).toContain("failed:");
    expect(source).toContain("WhatsApp phone proof");
    expect(source).toContain("hear it");
    expect(source).toContain("pending items");
  });

  test("surfaces public-sale readiness without exposing secrets", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("evaluateSaleReadiness");
    expect(source).toContain("Public sale");
    expect(source).toContain("blocker(s)");
  });

  test("does not expose WhatsApp QR payloads", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).not.toContain("qr=");
    expect(source).not.toContain("qrUrl");
    expect(source).not.toContain("api.qrserver.com");
  });
});
