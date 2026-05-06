import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("go-live without Nitesh runbook", () => {
  const source = readFileSync("docs/go-live-without-nitesh.md", "utf8");

  test("keeps autonomous work limited to safe local actions", () => {
    expect(source).toContain("Safe to do autonomously");
    expect(source).toContain("Run `pnpm run release:preflight`");
    expect(source).toContain("Run `pnpm run security:snyk`");
    expect(source).toContain("Run `pnpm run release:live-smoke`");
    expect(source).toContain("Run `pnpm run audit:doctor`");
    expect(source).toContain("Fix local code issues");
  });

  test("blocks deploy, push, data deletion, and real outbound actions without Nitesh", () => {
    expect(source).toContain("Deploy to production");
    expect(source).toContain("Push to GitHub");
    expect(source).toContain("Delete production data");
    expect(source).toContain("Connect new third-party accounts");
    expect(source).toContain("Send outbound WhatsApp, email, SMS, or calendar actions to real people");
  });

  test("records current machine and public-sale blockers", () => {
    expect(source).toContain("Docker is not installed/running locally");
    expect(source).toContain("Windows symlink privilege is unavailable");
    expect(source).toContain("Run `git status -sb` before push/deploy");
    expect(source).toContain("Public multi-user sale still needs account separation");
  });
});
