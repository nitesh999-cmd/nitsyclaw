import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant boundary scripts", () => {
  it("exposes a tenant boundary check script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["tenant:check"]).toBe("pnpm exec tsx scripts/tenant-boundary-check.ts");
  });

  it("keeps the tenant boundary check output secret-free", () => {
    const source = readFileSync("scripts/tenant-boundary-check.ts", "utf8");

    expect(source).toContain("evaluateTenantBoundaries");
    expect(source).not.toContain("DATABASE_URL");
    expect(source).not.toContain("process.env.");
  });
});
