import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Strip comments so "must not contain" assertions test code, not prose. The
 * page deliberately documents the removed `ownerHash` predicate in a comment;
 * that explanation must not be what keeps these assertions honest.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

const PAGE = "apps/dashboard/src/app/local-brain/page.tsx";

describe("local brain dashboard approval guard", () => {
  it("shows only owner-scoped, unexpired pending confirmations", () => {
    const source = readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8");

    expect(source).toContain("eq(confirmations.ownerHash, ownerHash)");
    expect(source).toContain('eq(confirmations.status, "pending")');
    expect(source).toContain("gt(confirmations.expiresAt, new Date())");
  });

  it("no longer queries model_route audit rows by a removed ownerHash payload field", () => {
    const source = code(PAGE);

    // 5431d9c removed ownerHash from model_route payloads, so this predicate
    // could never match again; audit_log has no owner column to replace it.
    expect(source).not.toContain("->>'ownerHash'");
    expect(source).not.toContain("auditLog");
    expect(source).not.toContain("model_route");
  });

  it("fails closed instead of showing a routing row it cannot attribute", () => {
    const source = code(PAGE);

    expect(source).toContain('ROUTE_TELEMETRY_UNAVAILABLE = "Owner-scoped routing telemetry is unavailable"');
    expect(source).toContain("?? ROUTE_TELEMETRY_UNAVAILABLE");
    expect(source).toContain('data-testid="local-brain-route-telemetry"');
    // The real load path never supplies a route, so the neutral state is what renders.
    expect(source).toContain("route: null, retrieved, retrievalNote, excludedCount");
  });

  it("keeps live provider health and privacy mode, which need no audit row", () => {
    const source = code(PAGE);

    expect(source).toContain("await provider.health()");
    expect(source).toContain("localBrainModeFromEnv()");
    expect(source).toContain("data.health.chatModel");
    expect(source).toContain("data.health.latencyMs");
    expect(source).toContain("data.health.models.length");
  });

  it("renders synthetic browser-proof checks only through explicit fixture data", () => {
    const source = readFileSync("apps/dashboard/src/app/local-brain/page.tsx", "utf8");

    expect(source).toContain("isLocalBrainBrowserProofEnabled()");
    expect(source).toContain("loadBrowserProofLocalBrain(provider, health)");
    expect(source).toContain('data-testid="local-brain-browser-proof"');
    expect(source).toContain("data.browserProof.checks");
  });
});
