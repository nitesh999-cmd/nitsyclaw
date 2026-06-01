import { describe, expect, it } from "vitest";
import { isRailwayRelevantPath, railwayTokenGate } from "./ci-railway-token-gate.js";

describe("Railway token CI gate", () => {
  it("detects files that can redeploy the WhatsApp worker", () => {
    expect(isRailwayRelevantPath("apps/bot/src/index.ts")).toBe(true);
    expect(isRailwayRelevantPath("packages/shared/src/env.ts")).toBe(true);
    expect(isRailwayRelevantPath("railway.json")).toBe(true);
    expect(isRailwayRelevantPath("apps/dashboard/src/app/page.tsx")).toBe(false);
    expect(isRailwayRelevantPath("docs/deploy.md")).toBe(false);
  });

  it("fails when a worker change has no Railway token", () => {
    const result = railwayTokenGate({
      token: "",
      changedFiles: ["apps/bot/src/index.ts", "apps/dashboard/src/app/page.tsx"],
    });

    expect(result.shouldFail).toBe(true);
    expect(result.configured).toBe(false);
    expect(result.relevantFiles).toEqual(["apps/bot/src/index.ts"]);
  });

  it("allows dashboard-only changes without a Railway token", () => {
    const result = railwayTokenGate({
      token: "",
      changedFiles: ["apps/dashboard/src/app/page.tsx"],
    });

    expect(result.shouldFail).toBe(false);
    expect(result.configured).toBe(false);
  });

  it("allows worker changes when the Railway token is configured", () => {
    const result = railwayTokenGate({
      token: "railway-token",
      changedFiles: ["packages/shared/src/env.ts"],
    });

    expect(result.shouldFail).toBe(false);
    expect(result.configured).toBe(true);
  });
});
