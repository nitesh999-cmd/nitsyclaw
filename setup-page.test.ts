import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard setup page", () => {
  test("gives normal users a safe provider setup path", () => {
    const source = readFileSync("apps/dashboard/src/app/setup/page.tsx", "utf8");

    expect(source).toContain("Connect one useful thing at a time");
    expect(source).toContain("getProviderSetupReadiness");
    expect(source).toContain("Best order");
    expect(source).toContain("Works without more setup");
    expect(source).toContain("Do not fake these");
    expect(source).toContain("Real email sending");
    expect(source).toContain("Bank feeds and live account data");
    expect(source).toContain("Test:");
    expect(source).not.toContain("TODO");
    expect(source).not.toContain("placeholder");
  });

  test("adds setup to the main navigation", () => {
    const source = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");

    expect(source).toContain('href: "/setup"');
    expect(source).toContain('label: "Setup"');
  });
});
