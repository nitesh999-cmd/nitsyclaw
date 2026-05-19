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

  test("surfaces bot runtime deploy identity from the database", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain('getSystemHeartbeat(db, "bot-runtime")');
    expect(source).toContain("Bot runtime");
    expect(source).toContain("botRuntimeFreshness");
    expect(source).toContain("Commit:");
    expect(source).toContain("Deployment:");
  });

  test("warns when dashboard and bot commits differ", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("buildDashboardRuntimeMetadata");
    expect(source).toContain("runtimeCommitMismatch");
    expect(source).toContain("Bot and dashboard are on different commits");
    expect(source).toContain("Railway may not have redeployed the WhatsApp worker yet");
    expect(source).toContain("Dashboard runtime");
    expect(source).toContain("/whatsapp-recovery");
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

  test("surfaces production observability signals", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("dashboardAuthAttempts");
    expect(source).toContain("Admin observability");
    expect(source).toContain("Queue age");
    expect(source).toContain("Route failures");
    expect(source).toContain("Slow calls");
    expect(source).toContain("Auth lockouts");
    expect(source).toContain("oldestQueueAgeHours");
    expect(source).toContain("recentFailures24h");
    expect(source).toContain("slowCalls24h");
    expect(source).toContain("activeAuthLockouts");
    expect(source).toContain("operationsStatus");
  });

  test("surfaces operator recovery commands for local and Railway checks", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("Operator recovery runbook");
    expect(source).toContain("pnpm run whatsapp:proof-local");
    expect(source).toContain("pnpm run railway:preflight");
    expect(source).toContain("resume whatsapp");
    expect(source).toContain("Open recovery board");
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
