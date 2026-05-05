import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production rollback path", () => {
  test("has a dry-run-first Vercel alias rollback helper", () => {
    const script = readFileSync("scripts/vercel-rollback.ps1", "utf8");

    expect(script).toContain("param(");
    expect(script).toContain("$TargetDeploymentUrl");
    expect(script).toContain("$DryRun");
    expect(script).toContain("$ExpectedCommit");
    expect(script).toContain("$PSCommandPath");
    expect(script).toContain('Join-Path $scriptDir ".."');
    expect(script).toContain(".vercel\\project.json");
    expect(script).toContain("vercel inspect");
    expect(script).toContain("--json");
    expect(script).toContain("ConvertFrom-Json");
    expect(script).toContain('readyState -ne "READY"');
    expect(script).toContain('$healthPath = "/api/healthz"');
    expect(script).toContain('$healthPath = "/login"');
    expect(script).toContain('curl.exe -sS -I "https://$primaryAlias$healthPath"');
    expect(script).toContain('"HTTP/.* (200|307)"');
    expect(script).toContain("vercel alias set");
    expect(script).toContain("Restore-Aliases");
    expect(script).toContain("Restoring $ChangedAlias");
    expect(script).toContain("nitsyclaw.vercel.app");
    expect(script).toContain("nitsyclaw-dashboard.vercel.app");
    expect(script).not.toMatch(/vercel\s+deploy\s+--prod/i);
    expect(script).not.toMatch(/git\s+reset|git\s+push/i);
  });

  test("documents the latest rollback target and exact restore command", () => {
    const doc = readFileSync("docs/rollback/production-rollback.md", "utf8");

    expect(doc).toContain("Current production");
    expect(doc).toContain("Rollback target");
    expect(doc).toContain("not a hard-coded value");
    expect(doc).toContain("npx vercel inspect https://nitsyclaw.vercel.app");
    expect(doc).toContain("<previous-ready-production-url>");
    expect(doc).toContain("scripts/vercel-rollback.ps1");
    expect(doc).toContain("older rollback target predates `/api/healthz`");
    expect(doc).toContain("pnpm release:live-smoke");
    expect(doc).toContain("No database schema rollback is required");
  });
});
