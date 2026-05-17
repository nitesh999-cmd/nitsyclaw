import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("live smoke script", () => {
  test("codifies post-deploy checks for public and protected surfaces", () => {
    const script = readFileSync("scripts/live-smoke.ps1", "utf8");
    const postDeployProof = readFileSync("scripts/post-deploy-proof.ps1", "utf8");
    const packageJson = readFileSync("package.json", "utf8");
    const testingDoc = readFileSync("docs/testing.md", "utf8");
    const releaseDoc = readFileSync("docs/release-safety.md", "utf8");

    expect(script).toContain("https://nitsyclaw.vercel.app");
    expect(script).toContain("/api/healthz");
    expect(script).toContain("/privacy");
    expect(script).toContain("/terms");
    expect(script).toContain("/api/sale-readiness");
    expect(script).toContain("/api/chat/history");
    expect(script).toContain("/command");
    expect(script).toContain("/login?next=%2Fcommand");
    expect(script).toContain("/health");
    expect(script).toContain("/login?next=%2Fhealth");
    expect(script).toContain("/whatsapp-recovery");
    expect(script).toContain("/login?next=%2Fwhatsapp-recovery");
    expect(script).toContain("Personal life admin");
    expect(script).toContain("Personal AI control plane");
    expect(script).toContain("Cache-Control");
    expect(script).toContain("no-store");
    expect(script).toContain("curl.exe");
    expect(script).not.toContain("SkipHttpErrorCheck");
    expect(postDeployProof).toContain("build all pending features");
    expect(postDeployProof).toContain("Pending build plan");
    expect(packageJson).toContain("\"release:live-smoke\"");
    expect(testingDoc).toContain("pnpm release:live-smoke");
    expect(releaseDoc).toContain("pnpm release:live-smoke");
  });
});
