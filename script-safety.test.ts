import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const BANNED_SCRIPT_PATTERNS = [
  /git\s+reset/i,
  /reset\s+--hard/i,
  /git\s+add\s+(\.|-A|--all)/i,
  /git\s+remote\s+set-url/i,
  /GITHUB_PAT/i,
  /https:\/\/[^/\s]+@github\.com/i,
  /git\s+push/i,
  /vercel\s+deploy\s+--prod/i,
] as const;

function trackedScriptFiles(): string[] {
  const output = execFileSync(
    "git",
    [
      "-c",
      "safe.directory=C:/Users/Nitesh/projects/NitsyClaw",
      "ls-files",
      "*.ps1",
      "scripts/*.ps1",
      "*.cmd",
      "*.bat",
      "*.sh",
    ],
    { encoding: "utf8" },
  );

  return output.trim().split(/\r?\n/).filter((file) => file && existsSync(file));
}

describe("release script safety", () => {
  test("tracked scripts do not broadly stage, reset, push, deploy, or rewrite remotes", () => {
    const violations = trackedScriptFiles().flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return BANNED_SCRIPT_PATTERNS
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  test("always-on startup scripts do not kill every node process or start dev dashboard mode", () => {
    const startupScripts = [
      "silent-launcher.ps1",
      "launch-bot.ps1",
      "broom.ps1",
      "watchdog.ps1",
      "setup-always-on.ps1",
    ];
    const violations = startupScripts.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        /Get-Process\s+node[\s\S]*Stop-Process\s+-Force/i,
        /pnpm\s+dashboard/i,
        /pnpm\s+bot(?!:|\s+--filter)/i,
      ]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
