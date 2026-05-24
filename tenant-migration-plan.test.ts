import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant migration plan", () => {
  it("has a script and CI-visible package command", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["tenant:migration-plan"]).toBe("pnpm exec tsx scripts/tenant-migration-plan-check.ts");
  });

  it("covers every currently blocked customer-data table", () => {
    const plan = readFileSync("docs/tenant-boundary-migration-plan.md", "utf8");

    for (const table of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      expect(plan).toContain(`\`${table}\``);
    }
    expect(plan).toContain("pnpm run tenant:access-inventory");
    expect(plan).toContain("unscoped customer-data access points");
    expect(plan).toContain("docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md");
    expect(plan).toContain("fresh database backup");
  });

  it("has an execution-grade tenant schema plan", () => {
    const path = "docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md";
    expect(existsSync(path)).toBe(true);

    const plan = readFileSync(path, "utf8");
    expect(plan).toContain("owner_hash text not null default 'owner'");
    expect(plan).toContain("TenantContext");
    expect(plan).toContain("Do not change production schema from this plan alone.");
    expect(plan).toContain("pnpm run whatsapp:smoke");
  });

  it("does not include destructive SQL instructions", () => {
    const plan = readFileSync("docs/tenant-boundary-migration-plan.md", "utf8");

    expect(plan).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(plan).not.toMatch(/\bTRUNCATE\b/i);
    expect(plan).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(plan).not.toMatch(/\bCASCADE\b/i);
  });
});
