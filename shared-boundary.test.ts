import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function trackedSharedSourceFiles(): string[] {
  const output = execFileSync(
    "git",
    [
      "-c",
      "safe.directory=C:/Users/Nitesh/projects/NitsyClaw",
      "ls-files",
      "packages/shared/src/**/*.ts",
    ],
    { encoding: "utf8" },
  );

  return output.trim().split(/\r?\n/).filter((file) => file && existsSync(file));
}

describe("shared package boundary", () => {
  test("does not runtime-import bot application code", () => {
    const files = trackedSharedSourceFiles();
    expect(files.length).toBeGreaterThan(20);

    const importPatterns = [
      /from\s+["'][^"']*apps\/bot[^"']*["']/,
      /from\s+["'][^"']*apps\\bot[^"']*["']/,
      /from\s+["']@nitsyclaw\/bot(?:\/[^"']*)?["']/,
      /import\s*\(\s*["'][^"']*apps\/bot[^"']*["']\s*\)/,
      /import\s*\(\s*["'][^"']*apps\\bot[^"']*["']\s*\)/,
      /import\s*\(\s*["']@nitsyclaw\/bot(?:\/[^"']*)?["']\s*\)/,
      /require\s*\(\s*["'][^"']*apps\/bot[^"']*["']\s*\)/,
      /require\s*\(\s*["'][^"']*apps\\bot[^"']*["']\s*\)/,
      /require\s*\(\s*["']@nitsyclaw\/bot(?:\/[^"']*)?["']\s*\)/,
    ] as const;

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return importPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
