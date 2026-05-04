import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production rollback path", () => {
  test("has a dry-run-first Vercel alias rollback helper", () => {
    const script = readFileSync("scripts/vercel-rollback.ps1", "utf8");

    expect(script).toContain("param(");
    expect(script).toContain("$TargetDeploymentUrl");
    expect(script).toContain("$DryRun");
    expect(script).toContain("$PSCommandPath");
    expect(script).toContain('Join-Path $scriptDir ".."');
    expect(script).toContain(".vercel\\project.json");
    expect(script).toContain("vercel inspect");
    expect(script).toContain("vercel alias set");
    expect(script).toContain("nitsyclaw.vercel.app");
    expect(script).toContain("nitsyclaw-dashboard.vercel.app");
    expect(script).not.toMatch(/vercel\s+deploy\s+--prod/i);
    expect(script).not.toMatch(/git\s+reset|git\s+push/i);
  });

  test("documents the latest rollback target and exact restore command", () => {
    const doc = readFileSync("docs/rollback/production-rollback.md", "utf8");

    expect(doc).toContain("Current production");
    expect(doc).toContain("Rollback target");
    expect(doc).toContain("nitsyclaw-c056xnn5a-nitesh999-4886s-projects.vercel.app");
    expect(doc).toContain("nitsyclaw-ms1gbfwsv-nitesh999-4886s-projects.vercel.app");
    expect(doc).toContain("scripts/vercel-rollback.ps1");
    expect(doc).toContain("No database schema rollback is required");
  });
});
