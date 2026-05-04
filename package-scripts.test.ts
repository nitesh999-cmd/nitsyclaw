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
    expect(script).toContain("pnpm audit --audit-level=moderate");
    expect(script).not.toMatch(/\bgit\b|\bvercel\b|deploy|reset|stash/);
  });

  test("release preflight runs the safe PowerShell gate", () => {
    expect(rootPackage.scripts?.["release:preflight"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight.ps1",
    );
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
