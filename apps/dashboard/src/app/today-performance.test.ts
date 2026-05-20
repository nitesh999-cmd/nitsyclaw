import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("today dashboard performance guard", () => {
  it("uses a bounded storage timeout so login cannot buffer forever", () => {
    const source = readFileSync("apps/dashboard/src/app/page.tsx", "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("const DEFAULT_TODAY_TIMEOUT_MS = 1_200");
    expect(source).toContain("NITSYCLAW_TODAY_TIMEOUT_MS");
    expect(source).toContain("loadTodayWithTimeout");
    expect(source).toContain("Promise.race");
    expect(source).toContain("emptyTodayData");
    expect(source).toContain("dataUnavailable");
    expect(source).toContain("instead of pretending the day is empty");
    expect(source).toContain("Private personal PA");
    expect(source).toContain("today-trust-strip");
    expect(source).toContain("today-work-status");
    expect(source).toContain("today-quick-start");
    expect(source).toContain("What works now");
    expect(source).toContain("Needs setup");
    expect(source).toContain("Best next action");
    expect(source).toContain("Open setup guide");
    expect(source).toContain("Do not fake these");
    expect(source).toContain('href="/setup"');
    expect(source).toContain("mobile-dashboard-actions");
    expect(source).toContain("mobileActions");
    expect(source).toContain('href: "/health"');
    expect(source).toContain('href: "/whatsapp-recovery"');
    expect(source).toContain("Say what you need done.");
    expect(source).toContain("border-amber-900");
    expect(source).toContain("text-amber-200");
  });
});
