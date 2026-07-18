import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Local Brain prospect demo surface", () => {
  const page = readFileSync("apps/dashboard/src/app/local-brain/prospect-demo/page.tsx", "utf8");
  const shell = readFileSync("apps/dashboard/src/app/dashboard-shell.tsx", "utf8");
  const fixture = readFileSync("apps/dashboard/src/app/local-brain/prospect-demo-fixture.ts", "utf8");
  const runner = readFileSync("scripts/local-brain-prospect-demo.ts", "utf8");
  const networkGuard = readFileSync("scripts/local-only-network-guard.cjs", "utf8");

  it("leads with the customer promise and fictional preview disclosure", () => {
    expect(page).toContain("A personal assistant that remembers your life without sending it to the cloud.");
    expect(page).toContain("Fictional demonstration data only");
    expect(page).toContain("Owner-only preview. Not a public product release.");
  });

  it("shows human correction and approval language without technical internals", () => {
    expect(fixture).toContain("Remembered privately on this laptop");
    expect(fixture).toContain("Ready for your review");
    expect(page).toContain("Nothing has been sent");
    expect(page).toContain("Approve and send");
    expect(page).not.toContain("ownerHash");
    expect(page).not.toContain("qwen3:8b");
    expect(page).toContain("Preview only. Nothing was sent.");
    expect(page).toContain("This private preview demonstrates today’s focus");
  });

  it("removes normal dashboard navigation from the dedicated prospect route", () => {
    expect(shell).toContain('pathname === "/local-brain/prospect-demo"');
    expect(shell).toContain("isLogin || isPublicMarketing || isLocalProspectDemo");
  });

  it("fails closed on server egress and records source provenance", () => {
    expect(runner).toContain('NEXT_TELEMETRY_DISABLED: "1"');
    expect(runner).toContain("NITSYCLAW_LOCAL_NETWORK_AUDIT_FILE");
    expect(runner).toContain("readSourceProvenance");
    expect(runner).toContain("artifactHashes");
    expect(networkGuard).toContain("Local-only demo blocked a non-loopback connection");
    expect(networkGuard).toContain("net.Socket.prototype.connect");
  });
});
