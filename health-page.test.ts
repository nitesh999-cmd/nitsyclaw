import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard health page", () => {
  test("surfaces integration health without exposing secrets", () => {
    const source = readFileSync("apps/dashboard/src/app/health/page.tsx", "utf8");

    expect(source).toContain("loadDashboardProviderHealth");
    expect(source).toContain("Integration health checks");
    expect(source).toContain("Connected account readiness");
    expect(source).toContain("token freshness");
    expect(source).toContain("Configured:");
    expect(source).toContain("Missing:");
    expect(source).toContain("Health:");
    expect(source).toContain("Safety:");
    expect(source).toContain('href="/integrations"');
    expect(source).not.toContain("accessToken");
  });
});
