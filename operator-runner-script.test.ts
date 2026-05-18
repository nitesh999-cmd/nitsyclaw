import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operator runner script", () => {
  it("exposes a laptop-safe runner command and keeps dry-run as the default", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const script = readFileSync("scripts/operator-runner.ts", "utf8");

    expect(packageJson).toContain('"operator:next"');
    expect(packageJson).toContain("scripts/operator-runner.ts --dry-run");
    expect(packageJson).toContain('"operator:run"');
    expect(packageJson).toContain("scripts/operator-runner.ts --run");
    expect(script).toContain("listPendingFeatureRequests");
    expect(script).toContain("setFeatureRequestStatus");
    expect(script).toContain("runVerificationCommands");
    expect(script).toContain("Operator verification");
    expect(script).toContain("loadLocalEnv");
    expect(script).toContain("apps/dashboard/.env.local");
    expect(script).toContain("--claim");
    expect(script).toContain("--dry-run");
    expect(script).toContain("buildOperatorRunPlan");
    expect(script).toContain('expectedStatus: "pending"');
    expect(script).toContain("was not updated; it may have been claimed or removed");
    expect(script).toContain("Operator runner cannot read queued work because DATABASE_URL is not configured");
    expect(script).toContain("Copy the dashboard DATABASE_URL into .env.local");
  });
});
