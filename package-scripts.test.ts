import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("package scripts", () => {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  test("dashboard typecheck generates Next route types before tsc", () => {
    const dashboardPackage = JSON.parse(
      readFileSync("apps/dashboard/package.json", "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(dashboardPackage.scripts?.typecheck).toBe(
      "next typegen && tsc --noEmit",
    );
  });

  test("release check includes build, tests, e2e, and audit without deploy or git mutation", () => {
    const script = rootPackage.scripts?.["release:check"] ?? "";

    expect(script).toContain("pnpm lint");
    expect(script).toContain("pnpm -r typecheck");
    expect(script).toContain("pnpm build");
    expect(script).toContain("pnpm test:coverage");
    expect(script).toContain("pnpm test:e2e");
    expect(script).toContain("pnpm run security:deep");
    expect(script).not.toMatch(/\bgit\b|\bvercel\b|deploy|reset|stash/);
  });

  test("release preflight runs the safe PowerShell gate", () => {
    expect(rootPackage.scripts?.["release:preflight"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight.ps1",
    );
  });

  test("Vercel build gate uses the checked PowerShell wrapper", () => {
    expect(rootPackage.scripts?.["release:vercel-build"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-build.ps1",
    );

    const source = readFileSync("scripts/vercel-build.ps1", "utf8");
    expect(source).toContain("Test-WindowsSymlinkPrivilege");
    expect(source).toContain("vercel build --yes");
  });

  test("deep security gate runs Semgrep and pnpm audit", () => {
    expect(rootPackage.scripts?.["security:semgrep"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/semgrep-scan.ps1",
    );
    expect(rootPackage.scripts?.["security:audit"]).toBe(
      "pnpm audit --audit-level=moderate",
    );
    expect(rootPackage.scripts?.["security:deep"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security-deep.ps1",
    );

    const semgrepSource = readFileSync("scripts/semgrep-scan.ps1", "utf8");
    const deepSource = readFileSync("scripts/security-deep.ps1", "utf8");

    expect(semgrepSource).toContain('$env:PYTHONUTF8 = "1"');
    expect(semgrepSource).toContain("semgrep scan --config auto --error");
    expect(deepSource).toContain("semgrep-scan.ps1");
    expect(deepSource).toContain("pnpm audit --audit-level=moderate");
  });

  test("Snyk gate is explicit and separate from the default release gate", () => {
    expect(rootPackage.scripts?.["security:snyk"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/snyk-scan.ps1",
    );
    expect(rootPackage.scripts?.["release:check"]).not.toContain("security:snyk");

    const source = readFileSync("scripts/snyk-scan.ps1", "utf8");
    expect(source).toContain("snyk test --all-projects --severity-threshold=medium");
    expect(source).toContain("SNYK_TOKEN");
  });

  test("root bot loop script points at a real bot package script", () => {
    const botPackage = JSON.parse(
      readFileSync("apps/bot/package.json", "utf8"),
    ) as { scripts?: Record<string, string> };
    const script = rootPackage.scripts?.["bot:loop"] ?? "";

    expect(script).toBe("pnpm --filter @nitsyclaw/bot start");
    expect(botPackage.scripts?.start).toBeTruthy();
  });
});
