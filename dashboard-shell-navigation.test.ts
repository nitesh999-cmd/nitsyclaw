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
    expect(mobileSection).toContain('label: "Do"');
    expect(mobileSection).toContain('label: "Remind"');
    expect(mobileSection).toContain('label: "Saved"');
    expect(mobileSection).not.toContain('label: "Command"');
    expect(mobileSection).not.toContain('label: "Queue"');
    expect(source).toContain("nc-mobile-nav");
    expect(source).toContain('label: "Do"');
  });
});
