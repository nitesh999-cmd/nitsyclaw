import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard shell navigation", () => {
  test("keeps mobile navigation focused on normal daily home use", () => {
    const source = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");
    const mobileSection = source.slice(
      source.indexOf("const mobileNavItems"),
      source.indexOf("export function DashboardShell"),
    );

    expect(mobileSection).toContain('label: "Today"');
    expect(mobileSection).toContain('label: "Ask"');
    expect(mobileSection).toContain('label: "Review"');
    expect(mobileSection).toContain('label: "Remember"');
    expect(mobileSection).toContain('label: "Requests"');
    expect(mobileSection).toContain('href: "/queue"');
    expect(mobileSection).not.toContain('label: "Settings"');
    expect(mobileSection).not.toContain('label: "Do"');
    expect(mobileSection).not.toContain('label: "Command"');
    expect(mobileSection).not.toContain('label: "Queue"');
    expect(source).toContain("nc-mobile-nav");
    expect(source).toContain('label: "Advanced"');
    expect(source).toContain('label: "Requests"');
    expect(source).toContain('href: "/whatsapp-recovery"');
    expect(source).toContain('label: "WA recovery"');
  });
});
