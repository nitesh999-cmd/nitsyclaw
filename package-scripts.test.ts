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
      "next typegen && node ../../scripts/next-typegen-dev.mjs",
    );
    expect(readFileSync("scripts/next-typegen-dev.mjs", "utf8")).toContain(
      "or ${stableRoutesPath}",
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

    const source = readFileSync("scripts/preflight.ps1", "utf8");
    expect(source).toContain("Restore-NextEnvRouteImport");
    expect(source).toContain('import "./.next/types/routes.d.ts";');
    expect(source).not.toContain("git checkout");
    expect(source).not.toContain("git reset");
  });

  test("Playwright starts Next 16 dev server with the selected bundler", () => {
    const source = readFileSync("playwright.config.ts", "utf8");

    expect(source).toContain("next dev --webpack -p 3101");
  });

  test("Vercel build gate uses the checked PowerShell wrapper", () => {
    expect(rootPackage.scripts?.["release:vercel-build"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-build.ps1",
    );

    const source = readFileSync("scripts/vercel-build.ps1", "utf8");
    expect(source).toContain("Test-WindowsSymlinkPrivilege");
    expect(source).toContain("vercel build --yes");
  });

  test("audit doctor checks machine blockers before external security gates", () => {
    expect(rootPackage.scripts?.["audit:doctor"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-doctor.ps1",
    );

    const source = readFileSync("scripts/audit-doctor.ps1", "utf8");
    expect(source).toContain("docker info");
    expect(source).toContain("Test-WindowsSymlinkPrivilege");
    expect(source).toContain("vercel");
    expect(source).toContain("/api/healthz");
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
    expect(source).toContain("snyk test --all-projects --detection-depth=2 --severity-threshold=medium");
    expect(source).not.toContain("apps\\dashboard\\.next");
    expect(source).toContain("SNYK_TOKEN");
  });

  test("ZAP baseline gate is explicit and requires Docker", () => {
    expect(rootPackage.scripts?.["security:zap"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/zap-baseline.ps1",
    );

    const source = readFileSync("scripts/zap-baseline.ps1", "utf8");
    expect(source).toContain("Get-Command docker");
    expect(source).toContain("ghcr.io/zaproxy/zaproxy:stable");
    expect(source).toContain("host.docker.internal:host-gateway");
    expect(source).toContain("zap-baseline.py");
  });

  test("root bot loop script points at a real bot package script", () => {
    const botPackage = JSON.parse(
      readFileSync("apps/bot/package.json", "utf8"),
    ) as { scripts?: Record<string, string> };
    const script = rootPackage.scripts?.["bot:loop"] ?? "";

    expect(script).toBe("pnpm --filter @nitsyclaw/bot start");
    expect(botPackage.scripts?.start).toBeTruthy();
  });

  test("bot startup doctor checks boot prerequisites without starting WhatsApp", () => {
    expect(rootPackage.scripts?.["bot:doctor"]).toBe(
      "pnpm exec tsx scripts/bot-startup-doctor.ts",
    );

    const source = readFileSync("scripts/bot-startup-doctor.ts", "utf8");
    expect(source).toContain("loadEnv");
    expect(source).toContain("system_heartbeats");
    expect(source).toContain("command_jobs");
    expect(source).toContain("whatsappSessionDir");
    expect(source).not.toContain("WwebjsClient");
    expect(source).not.toMatch(/\bsend\s*\(/);
  });

  test("Railway preflight checks bot worker access without mutating deployments", () => {
    expect(rootPackage.scripts?.["railway:login"]).toBe(
      "pnpm dlx @railway/cli login --browserless",
    );
    expect(rootPackage.scripts?.["railway:preflight"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-preflight.ps1",
    );

    const source = readFileSync("scripts/railway-preflight.ps1", "utf8");
    expect(source).toContain("@railway/cli whoami --json");
    expect(source).toContain("pnpm run railway:login");
    expect(source).toContain("@railway/cli service list");
    expect(source).toContain("@railway/cli service status");
    expect(source).toContain("@railway/cli variable list");
    expect(source).toContain("NITSYCLAW_SECRET_ROOT");
    expect(source).toContain("NITSYCLAW_PRINT_QR_TO_LOGS");
    expect(source).toContain("NITSYCLAW_ALLOW_ABSOLUTE_SECRET_PATHS");
    expect(source).toContain("mountPath");
    expect(source).toContain("14a48d9f-310a-446f-9350-77a28ebdc239");
    expect(source).not.toMatch(/\bup\b|\bdeploy\b|\brestart\b|\bremove\b|\bdelete\b/);
  });

  test("Railway QR recovery scripts use protected token windows instead of QR logs", () => {
    expect(rootPackage.scripts?.["railway:qr-open"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-qr-open.ps1",
    );
    expect(rootPackage.scripts?.["railway:qr-close"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-qr-close.ps1",
    );

    const openSource = readFileSync("scripts/railway-qr-open.ps1", "utf8");
    expect(openSource).toContain("NITSYCLAW_QR_RECOVERY_TOKEN");
    expect(openSource).toContain("NITSYCLAW_QR_RECOVERY_UNTIL");
    expect(openSource).toContain("RandomNumberGenerator");
    expect(openSource).toContain("GetBytes");
    expect(openSource).toContain("Wait until Railway is healthy");
    expect(openSource).toContain("/recovery/whatsapp-qr");
    expect(openSource).not.toContain("/recovery/whatsapp-qr.svg?token=");
    expect(openSource).toContain('Remove-RailwayVariableIfPresent -Name "NITSYCLAW_PRINT_QR_TO_LOGS"');
    expect(openSource).not.toContain("NITSYCLAW_PRINT_QR_TO_LOGS=1");

    const closeSource = readFileSync("scripts/railway-qr-close.ps1", "utf8");
    expect(closeSource).toContain("NITSYCLAW_QR_RECOVERY_TOKEN");
    expect(closeSource).toContain("NITSYCLAW_QR_RECOVERY_UNTIL");
    expect(closeSource).toContain("NITSYCLAW_PRINT_QR_TO_LOGS");
    expect(closeSource).toContain("already absent");
    expect(closeSource).toContain("Railway variable still present after close");
    expect(closeSource).not.toContain("service restart");
  });

  test("Railway diagnose captures read-only crash logs without mutating deployments", () => {
    expect(rootPackage.scripts?.["railway:diagnose"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-diagnose.ps1",
    );

    const source = readFileSync("scripts/railway-diagnose.ps1", "utf8");
    expect(source).toContain("@railway/cli whoami --json");
    expect(source).toContain("pnpm run railway:login");
    expect(source).toContain("@railway/cli");
    expect(source).toContain("--deployment");
    expect(source).toContain("--latest");
    expect(source).toContain("--lines");
    expect(source).not.toMatch(/\bup\b|\bdeploy\b|\brestart\b|\bredeploy\b|\bremove\b|\bdelete\b/);
  });

  test("local WhatsApp proof runs web smoke and WhatsApp tests without Railway credentials", () => {
    expect(rootPackage.scripts?.["whatsapp:proof-local"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/whatsapp-proof-local.ps1",
    );

    const source = readFileSync("scripts/whatsapp-proof-local.ps1", "utf8");
    expect(source).toContain("release:live-smoke");
    expect(source).toContain("apps/bot/src/whatsapp-loop-breaker.test.ts");
    expect(source).toContain("apps/bot/test/router.integration.test.ts");
    expect(source).toContain("whatsapp-recovery-action-route.test.ts");
    expect(source).not.toContain("railway-preflight.ps1");
    expect(source).not.toContain("railway:preflight");
  });

  test("post-deploy proof combines Railway, public smoke, and phone prompts", () => {
    expect(rootPackage.scripts?.["release:post-deploy-proof"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/post-deploy-proof.ps1",
    );

    const source = readFileSync("scripts/post-deploy-proof.ps1", "utf8");
    expect(source).toContain("railway:whatsapp-ready");
    expect(source).toContain("release:live-smoke");
    expect(source).toContain("proof test");
    expect(source).toContain("I spent `$6.50 at Chemist Warehouse for medicine");
    expect(source).toContain("what can you do");
    expect(source).toContain("Compact NitsyClaw menu");
    expect(source).toContain("Works now");
    expect(source).not.toMatch(/\bup\b|\brestart\b|\bredeploy\b|\bremove\b|\bdelete\b/);
  });

  test("WhatsApp full release proves the pushed commit without mutating git", () => {
    expect(rootPackage.scripts?.["release:whatsapp-full"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/whatsapp-full-release.ps1",
    );

    const source = readFileSync("scripts/whatsapp-full-release.ps1", "utf8");
    expect(source).toContain("whatsapp:release-gate");
    expect(source).toContain("release:wait-railway");
    expect(source).toContain("release:post-deploy-proof");
    expect(source).toContain("git diff --quiet");
    expect(source).toContain("git rev-parse \"@{u}\"");
    expect(source).toContain("HEAD is not pushed");
    const executableGitMutationLines = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^git\s+(?:push|commit|reset|checkout|stash)\b/i.test(line));
    expect(executableGitMutationLines).toEqual([]);
    expect(source).not.toMatch(/\bup\b|\brestart\b|\bredeploy\b|\bremove\b|\bdelete\b/);
  });

  test("WhatsApp release gate is local, deterministic, and non-mutating", () => {
    expect(rootPackage.scripts?.["whatsapp:reply-shape-report"]).toBe(
      "pnpm exec tsx scripts/whatsapp-reply-shape-report.ts",
    );

    const shapeSource = readFileSync("scripts/whatsapp-reply-shape.ps1", "utf8");
    expect(shapeSource).toContain("whatsapp:reply-shape-report");
    expect(shapeSource).toContain("whatsapp-reply-format.test.ts");

    expect(rootPackage.scripts?.["whatsapp:release-gate"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/whatsapp-release-gate.ps1",
    );

    const source = readFileSync("scripts/whatsapp-release-gate.ps1", "utf8");
    expect(source).toContain("whatsapp:receipt-guard");
    expect(source).toContain("whatsapp:smoke");
    expect(source).toContain("whatsapp-capability-registry.test.ts");
    expect(source).not.toMatch(/@railway|railway:|\bvercel\b|\bdeploy\b|\brestart\b|\bsend\s*\(/i);
  });
});
