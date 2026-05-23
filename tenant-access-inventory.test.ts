import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant access inventory", () => {
  it("has a package script for finding unscoped customer-data access points", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["tenant:access-inventory"]).toBe("pnpm exec tsx scripts/tenant-access-inventory.ts");
  });

  it("tracks customer-owned tables that block public sale", () => {
    const source = readFileSync("scripts/tenant-access-inventory.ts", "utf8");

    for (const table of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      expect(source).toContain(`"${table}"`);
    }
    expect(source).toContain("tenant_access_inventory=");
    expect(source).toContain("operation=");
  });
});
