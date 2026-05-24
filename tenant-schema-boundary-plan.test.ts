import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant schema boundary plan", () => {
  const planPath = "docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md";
  const plan = readFileSync(planPath, "utf8");

  it("keeps the execution-grade plan present and approval-gated", () => {
    expect(existsSync(planPath)).toBe(true);
    expect(plan).toContain("Do not change production schema from this plan alone.");
    expect(plan).toContain("fresh backup and explicit approval");
    expect(plan).toContain("Do not enable `NITSYCLAW_PUBLIC_SALE_MODE=1`.");
    expect(plan).toContain("Do not set `NITSYCLAW_TENANT_ISOLATION=verified`.");
  });

  it("defines owner_hash for every blocked customer table", () => {
    for (const table of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      expect(plan).toContain(`\`${table}\``);
      expect(plan).toContain("owner_hash text not null default 'owner'");
    }
  });

  it("defines the required tenant-scoped indexes before migration work starts", () => {
    expect(plan).toContain("(owner_hash, created_at)");
    expect(plan).toContain("(owner_hash, kind)");
    expect(plan).toContain("(owner_hash, status, fire_at)");
    expect(plan).toContain("(owner_hash, occurred_at)");
    expect(plan).toContain("unique `(owner_hash, for_date)`");
    expect(plan).toContain("(owner_hash, status, expires_at)");
  });
});
