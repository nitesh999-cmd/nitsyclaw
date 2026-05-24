import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const realMigrationPath = "packages/shared/drizzle/0009_tenant_owner_hash.sql";
const schemaPath = "packages/shared/src/db/schema.ts";
const scopedTables = ["memories", "reminders", "expenses", "briefs", "confirmations"] as const;

describe("controlled tenant owner hash migration", () => {
  const migration = readFileSync(realMigrationPath, "utf8");
  const schema = readFileSync(schemaPath, "utf8");

  it("has a real Drizzle migration for every customer-owned table", () => {
    for (const table of scopedTables) {
      expect(migration).toContain(`ALTER TABLE "${table}"`);
      expect(migration).toContain(`UPDATE "${table}"`);
    }

    expect(migration).toContain("\"owner_hash\" text");
    expect(migration).toContain("SET DEFAULT 'owner'");
    expect(migration).toContain("SET NOT NULL");
  });

  it("has matching Drizzle schema ownerHash columns", () => {
    for (const exportName of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      const tableStart = schema.indexOf(`export const ${exportName} = pgTable`);
      expect(tableStart).toBeGreaterThanOrEqual(0);
      const nextExport = schema.indexOf("\nexport const ", tableStart + 1);
      const tableSource = schema.slice(tableStart, nextExport === -1 ? undefined : nextExport);
      expect(tableSource).toContain('ownerHash: text("owner_hash").notNull().default("owner")');
    }
  });

  it("does not drop or delete data", () => {
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bCASCADE\b/i);
  });
});
