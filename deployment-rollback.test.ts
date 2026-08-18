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
    // This release DOES ship migrations, so the old "no database schema
    // rollback is required" sentence became false and was removed. The rule it
    // guarded still stands, and is asserted here against the truthful content:
    // name the migrations, the artifact, the commands, the window, the policy.
    expect(doc).not.toContain("No database schema rollback is required");
    for (const migration of [
      "0009_wealthy_grandmaster.sql",
      "0010_tenant_owner_hash_scoped_domains.sql",
      "0011_voice_verification.sql",
      "0012_voice_proposal_binding.sql",
    ]) {
      expect(doc, `runbook must name ${migration}`).toContain(migration);
    }
    expect(doc).toContain("nitsyclaw-prod-20260816T100733Z.dump.gpg");
    expect(doc).toContain("07dce7fc813bae4c5c5a758134c79a75c4521eddf2ee0ad2c03f798740b213fc");
    expect(doc).toContain("packages/shared/migrate-runner.ops.mjs");
    expect(doc).toContain("packages/shared/rollback-0011-0012.ops.sql");
    expect(doc).toContain("pg_restore");
    expect(doc.toLowerCase()).toContain("fix-forward");
    expect(doc.toLowerCase()).toContain("empty");
    // PITR is off, so the recovery floor must be stated rather than assumed.
    expect(doc).toContain("PITR");
  });
});
