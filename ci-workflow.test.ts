import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("GitHub Actions CI workflow", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

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

  it("uses packageManager from package.json for pnpm setup", () => {
    expect(workflow).toContain("uses: pnpm/action-setup@v4");
    expect(workflow).not.toMatch(/uses:\s*pnpm\/action-setup@v4\s*\r?\n\s*with:\s*\r?\n/);
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
    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true");
    expect(workflow).toContain("runs-on: windows-2025-vs2026");
    expect(workflow).toContain("Parse tracked PowerShell scripts");
    expect(workflow).toContain("pnpm test");
  });

  it("waits for Railway and runs the deploy watchdog before WhatsApp production smoke", () => {
    expect(workflow).toContain("Wait for Railway deployment");
    expect(workflow).toContain("./scripts/railway-wait-for-commit.ps1");
    expect(workflow).toContain("Check Railway deploy watchdog");
    expect(workflow).toContain("./scripts/railway-deploy-watchdog.ps1");
    expect(workflow).toContain("Run WhatsApp production smoke");
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
});
