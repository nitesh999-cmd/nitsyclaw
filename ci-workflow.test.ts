import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Actions CI workflow", () => {
  // Normalise line endings: Windows checkouts materialise ci.yml with CRLF
  // (core.autocrlf), and the structural assertions below anchor on "\n  <job>:\n".
  // Without this the same committed workflow parses on Linux and fails on Windows.
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8").replace(/\r\n?/g, "\n");

  it("does not leave empty with blocks on action steps", () => {
    const lines = workflow.split(/\r?\n/);
    const emptyWithLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const match = line.match(/^(\s*)with:\s*$/);
      if (!match) continue;

      const indent = match[1].length;
      const nextMeaningful = lines
        .slice(i + 1)
        .find((candidate) => candidate.trim().length > 0);
      const nextIndent = nextMeaningful?.match(/^(\s*)/)?.[1]?.length ?? 0;

      if (!nextMeaningful || nextIndent <= indent) {
        emptyWithLines.push(i + 1);
      }
    }

    expect(emptyWithLines).toEqual([]);
  });

  it("pins every action to an immutable SHA at the Node 24-compatible major version", () => {
    // Every action is pinned to a 40-character commit SHA so the reference cannot be
    // silently repointed, with the human-readable version kept in a trailing comment.
    // Both halves are asserted: the immutable pin AND the intended major.
    // EVERY `uses:` line must satisfy the contract, not merely one representative
    // occurrence — otherwise a single reference could be repointed to `@main` or
    // lose its version comment while the others keep the assertion green.
    const majors: Record<string, string> = {
      "actions/checkout": "v6",
      "pnpm/action-setup": "v6",
      "actions/setup-node": "v5",
      "actions/upload-artifact": "v7",
      "actions/cache": "v6",
    };
    const usesLines = workflow.split("\n").filter((line) => /^\s*(-\s*)?uses:/.test(line));
    expect(usesLines).toHaveLength(24);
    for (const line of usesLines) {
      const parsed = /uses:\s*([\w.-]+\/[\w.-]+)@([^\s#]+)\s*#\s*(v\S+)\s*$/.exec(line);
      expect(parsed, `unpinned or uncommented action: ${line.trim()}`).not.toBeNull();
      const [, action, ref, version] = parsed!;
      expect(ref, `not a 40-char SHA: ${line.trim()}`).toMatch(/^[0-9a-f]{40}$/);
      expect(majors[action!], `unexpected action: ${action}`).toBeDefined();
      expect(version!.startsWith(`${majors[action!]}.`), `wrong major for ${action}: ${version}`).toBe(true);
    }
    // No mutable reference of any shape — tag, branch or floating name.
    expect(workflow).not.toMatch(/uses:\s*[\w.-]+\/[\w.-]+@(?![0-9a-f]{40}\b)/);
    expect(workflow).not.toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24");
    expect(workflow).not.toMatch(/uses:\s*pnpm\/action-setup@[0-9a-f]{40}[^\n]*\r?\n\s*with:\s*\r?\n/);
  });

  it("runs the production build before coverage and e2e gates", () => {
    expect(workflow).toContain("pnpm build");
    expect(workflow.indexOf("pnpm build")).toBeLessThan(
      workflow.indexOf("pnpm test:coverage"),
    );
  });

  it("runs the WhatsApp release gate in CI before coverage", () => {
    expect(workflow).toContain("WhatsApp release gate");
    expect(workflow).toContain("./scripts/whatsapp-release-gate.ps1");
    expect(workflow.indexOf("./scripts/whatsapp-release-gate.ps1")).toBeLessThan(
      workflow.indexOf("pnpm test:coverage"),
    );
  });

  it("prints the tenant access inventory in CI before coverage", () => {
    expect(workflow).toContain("pnpm tenant:access-inventory");
    expect(workflow.indexOf("pnpm tenant:access-inventory")).toBeLessThan(
      workflow.indexOf("pnpm test:coverage"),
    );
  });

  it("runs explicit WhatsApp snapshot and provider readiness gates before coverage", () => {
    expect(workflow).toContain("WhatsApp reply snapshot drift");
    expect(workflow).toContain("pnpm ci:whatsapp-snapshots");
    expect(workflow).toContain("Provider readiness gate");
    expect(workflow).toContain("pnpm ci:provider-readiness");
    expect(workflow.indexOf("pnpm ci:whatsapp-snapshots")).toBeLessThan(
      workflow.indexOf("pnpm test:coverage"),
    );
    expect(workflow.indexOf("pnpm ci:provider-readiness")).toBeLessThan(
      workflow.indexOf("pnpm test:coverage"),
    );
  });

  it("has a Windows lane for PowerShell and package-script regressions", () => {
    expect(workflow).toContain("runs-on: windows-2025-vs2026");
    expect(workflow).toContain("Parse tracked PowerShell scripts");
    expect(workflow).toContain("pnpm test");
  });

  it("waits for Railway on push and smoke-tests the serving deployment on manual runs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("steps.railway-token.outputs.configured == 'true' && github.event_name == 'push'");
    expect(workflow).toContain("steps.railway-token.outputs.configured == 'true' && github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("Wait for Railway deployment");
    expect(workflow).toContain("./scripts/railway-wait-for-commit.ps1");
    expect(workflow).toContain("Check Railway deploy watchdog");
    expect(workflow).toContain("./scripts/railway-deploy-watchdog.ps1");
    expect(workflow).toContain("Run WhatsApp production smoke for pushed deployment");
    expect(workflow).toContain("Run WhatsApp production smoke for serving deployment");
    expect(workflow).toContain("./scripts/whatsapp-production-smoke.ps1 -AllowServingCommit");
    expect(workflow).toContain("fetch-depth: 2");
    expect(workflow).toContain("pnpm exec tsx scripts/ci-railway-token-gate.ts");
    expect(workflow.indexOf("./scripts/railway-wait-for-commit.ps1")).toBeLessThan(
      workflow.indexOf("./scripts/railway-deploy-watchdog.ps1"),
    );
    expect(workflow.indexOf("./scripts/railway-deploy-watchdog.ps1")).toBeLessThan(
      workflow.indexOf("./scripts/whatsapp-production-smoke.ps1"),
    );
  });

  it("has a Linux Vercel packaging gate for main branch releases", () => {
    expect(workflow).toContain("vercel-build:");
    expect(workflow).toContain("node-version: 22.19.0");
    expect(workflow).toContain("VERCEL_TOKEN");
    expect(workflow).toContain("VERCEL_ORG_ID");
    expect(workflow).toContain("VERCEL_PROJECT_ID");
    expect(workflow).toContain("::warning::Skipping Vercel packaging check");
    expect(workflow).toContain("Production deploy proof must come from Vercel deployment status plus release:live-smoke");
    expect(workflow).toContain("configured=false");
    expect(workflow).toContain("steps.vercel-secrets.outputs.configured == 'true'");
    expect(workflow).toContain("pnpm exec vercel build --yes --token");
  });

  it("has an OWASP ZAP baseline gate against a local dashboard", () => {
    expect(workflow).toContain("zap-baseline:");
    expect(workflow).toContain("Start dashboard for ZAP");
    expect(workflow).toContain("next dev --webpack -p 3101");
    expect(workflow).toContain("Run OWASP ZAP baseline");
    expect(workflow).toContain("zap-report.html");
  });

  // ---------------------------------------------------------------------
  // WhatsApp runtime ownership: Railway is explicit opt-in, laptop is default
  // ---------------------------------------------------------------------

  /**
   * The `if:` line belonging to one job, or "" when it has none.
   *
   * The body is bounded at the next top-level job key, otherwise a job without
   * an `if:` silently inherits the next job's condition and the assertion
   * becomes meaningless.
   */
  function jobCondition(job: string): string {
    const start = workflow.indexOf(`\n  ${job}:\n`);
    expect(start, `job ${job} not found`).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const nextJob = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
    const body = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
    const line = body.split("\n").find((l) => l.trim().startsWith("if:"));
    return line?.trim() ?? "";
  }

  it("job condition helper is bounded to a single job", () => {
    // e2e genuinely has no `if:`; proving that keeps the ungated-jobs test honest.
    expect(jobCondition("e2e")).toBe("");
    expect(jobCondition("whatsapp-production-smoke")).toContain("vars.");
  });

  it("skips the Railway WhatsApp smoke job unless ownership is explicitly railway", () => {
    const condition = jobCondition("whatsapp-production-smoke");

    // Gated on the repository variable, matching the bot's runtime guard.
    expect(condition).toContain("vars.NITSYCLAW_WHATSAPP_RUNTIME_OWNER == 'railway'");
    // The pre-existing branch and event gates are retained, not replaced.
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("github.event_name == 'workflow_dispatch'");
    // An unset repository variable evaluates to '' and cannot equal 'railway',
    // so the default state is a clean skip.
    expect(condition).not.toContain("!=");
    expect(condition).not.toContain("contains(");
  });

  it("keeps the Railway smoke capability available for a deliberate migration", () => {
    // The job body is unchanged: setting the variable to 'railway' restores it.
    expect(workflow).toContain("whatsapp-production-smoke:");
    expect(workflow).toContain("./scripts/whatsapp-production-smoke.ps1");
    expect(workflow).toContain("./scripts/railway-wait-for-commit.ps1");
    expect(workflow).toContain("./scripts/railway-deploy-watchdog.ps1");
    expect(workflow).toContain("pnpm exec tsx scripts/ci-railway-token-gate.ts");
  });

  it("leaves the normal test, e2e, security, browser and Vercel jobs ungated by ownership", () => {
    for (const job of ["test", "e2e", "security", "zap-baseline"]) {
      expect(jobCondition(job), `${job} must not be ownership-gated`).not.toContain(
        "NITSYCLAW_WHATSAPP_RUNTIME_OWNER",
      );
    }
    // Vercel keeps its original branch/event gate only.
    const vercel = jobCondition("vercel-build");
    expect(vercel).toContain("github.ref == 'refs/heads/main'");
    expect(vercel).not.toContain("NITSYCLAW_WHATSAPP_RUNTIME_OWNER");
  });

  it("gates only the Railway smoke job on ownership", () => {
    const occurrences = workflow.split("vars.NITSYCLAW_WHATSAPP_RUNTIME_OWNER").length - 1;
    expect(occurrences).toBe(1);
  });
});
