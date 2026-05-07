import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("dashboard error boundary", () => {
  test("does not log the raw browser error object", () => {
    const source = readFileSync("apps/dashboard/src/app/error.tsx", "utf8");

    expect(source).not.toContain('console.error("[dashboard/error]", error)');
    expect(source).toContain("digest: error.digest");
    expect(source).toContain("name: error.name");
  });
});
