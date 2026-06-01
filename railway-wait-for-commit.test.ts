import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("Railway wait for commit script", () => {
  const source = readFileSync("scripts/railway-wait-for-commit.ps1", "utf8");

  test("uses current Railway deployment list CLI flags", () => {
    expect(source).toContain("deployment list");
    expect(source).toContain("--environment $Environment");
    expect(source).toContain("--service $Service");
    expect(source).toContain("--limit 10");
    expect(source).toContain("--json");
    expect(source).not.toContain("--project $ProjectId");
  });
});
