import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("integrations health API", () => {
  test("returns shared provider health without exposing raw secrets", () => {
    const source = readFileSync("apps/dashboard/src/app/api/integrations/health/route.ts", "utf8");

    expect(source).toContain("loadDashboardProviderHealth");
    expect(source).toContain("requireSameOrigin");
    expect(source).toContain("Cache-Control");
    expect(source).toContain("no-store");
    expect(source).toContain("Integration health is unavailable");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("accessToken");
  });
});
