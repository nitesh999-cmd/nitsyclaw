import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const docsToCheck = [
  "docs/testing.md",
  "docs/release-safety.md",
  "docs/deploy.md",
  "docs/go-live-without-nitesh.md",
] as const;

const claimedScripts = [
  "release:preflight",
  "release:live-smoke",
  "audit:doctor",
  "security:deep",
  "security:semgrep",
  "security:audit",
  "security:snyk",
  "test:e2e",
  "test:coverage",
] as const;

describe("release documentation claims", () => {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  test("documented release commands map to real package scripts", () => {
    const missing = docsToCheck.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return claimedScripts
        .filter((script) => source.includes(script) && !rootPackage.scripts?.[script])
        .map((script) => `${file}: ${script}`);
    });

    expect(missing).toEqual([]);
  });

  test("testing doc avoids hard-coded test counts that drift quickly", () => {
    const source = readFileSync("docs/testing.md", "utf8");

    expect(source).not.toMatch(/pnpm test` passes:\s+\d+\s+files,\s+\d+\s+tests/i);
    expect(source).not.toMatch(/\|\s*Unit \+ integration\s*\|\s*\d+\s*\|\s*\d+\s*\|/i);
    expect(source).not.toMatch(/\|\s*E2E\s*\|\s*\d+\s*\|\s*\d+\s*\|/i);
  });
});
