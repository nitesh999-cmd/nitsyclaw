import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("external env loading", () => {
  test("Playwright loads dashboard env from the external secret root", () => {
    const source = readFileSync("playwright.config.ts", "utf8");

    expect(source).toContain("NITSYCLAW_SECRET_ROOT");
    expect(source).toContain(".nitsyclaw");
    expect(source).toContain(".env.local");
    expect(source).toContain("apps-dashboard.env.local");
    expect(source).toContain("packages-shared.env.local");
  });
});
