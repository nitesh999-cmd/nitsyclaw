import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("beta tester tracker", () => {
  it("documents a manual beta lead follow-up process without collecting payment", () => {
    const tracker = readFileSync("docs/beta-tester-tracker.md", "utf8");

    expect(tracker).toContain("Private beta lead tracker");
    expect(tracker).toContain("No payment is collected from this flow.");
    expect(tracker).toContain("Follow-up status");
    expect(tracker).toContain("Main use case");
    expect(tracker).toContain("Safety notes");
    expect(tracker).toContain("Do not onboard paid public users until tenant isolation is verified.");
  });
});
