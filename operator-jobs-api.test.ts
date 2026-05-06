import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operator jobs API", () => {
  it("supports idempotent top-20 and next-50 queue actions under same-origin protection", () => {
    const source = readFileSync("apps/dashboard/src/app/api/operator/jobs/route.ts", "utf8");

    expect(source).toContain("requireSameOrigin");
    expect(source).toContain("queue_all");
    expect(source).toContain("queue_next_50");
    expect(source).toContain("operator-mission:");
    expect(source).toContain("operator-next-50:");
    expect(source).toContain("findExistingMissionJob");
    expect(source).toContain("publicConfigErrorOrNull");
    expect(source).toContain("This does not run code or deploy by itself");
  });
});
