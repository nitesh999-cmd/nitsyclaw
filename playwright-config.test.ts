import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("Playwright config", () => {
  test("does not reuse stale local servers unless explicitly requested", () => {
    const source = readFileSync("playwright.config.ts", "utf8");

    expect(source).toContain('reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1"');
    expect(source).toContain('NITSYCLAW_DEV_AUTH_BYPASS: "1"');
    expect(source).not.toContain("reuseExistingServer: !process.env.CI");
  });
});
