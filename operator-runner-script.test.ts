import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operator runner script", () => {
  it("exposes a laptop-safe runner command and keeps dry-run as the default", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const script = readFileSync("scripts/operator-runner.ts", "utf8");

    expect(packageJson).toContain('"operator:next"');
    expect(packageJson).toContain("scripts/operator-runner.ts --dry-run");
    expect(script).toContain("listPendingFeatureRequests");
    expect(script).toContain("setFeatureRequestStatus");
    expect(script).toContain("loadLocalEnv");
    expect(script).toContain("apps/dashboard/.env.local");
    expect(script).toContain("--claim");
    expect(script).toContain("--dry-run");
    expect(script).toContain("buildOperatorRunPlan");
  });
});
