import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local brain dashboard approval guard", () => {
  it("shows only owner-scoped, unexpired pending confirmations", () => {
    const source = readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8");

    expect(source).toContain("eq(confirmations.ownerHash, ownerHash)");
    expect(source).toContain('eq(confirmations.status, "pending")');
    expect(source).toContain("gt(confirmations.expiresAt, new Date())");
  });

  it("renders synthetic browser-proof checks only through explicit fixture data", () => {
    const source = readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8");

    expect(source).toContain("isLocalBrainBrowserProofEnabled()");
    expect(source).toContain("loadBrowserProofLocalBrain(provider, health)");
    expect(source).toContain('data-testid="local-brain-browser-proof"');
    expect(source).toContain("data.browserProof.checks");
    expect(source).toContain("Six things this demo proves");
    expect(source).toContain("Waiting for approval - {data.browserProof.actionCalls} actions sent");
    expect(source).toContain("Local Brain: remembers privately, acts carefully, runs locally.");
  });
});
