import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const draftPath = "docs/migration-drafts/0009_tenant_owner_hash.sql";

describe("tenant owner hash migration draft", () => {
  const draft = readFileSync(draftPath, "utf8");

  it("adds owner_hash for every blocked customer-data table", () => {
    for (const table of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      expect(draft).toContain(`ALTER TABLE "${table}"`);
      expect(draft).toContain("owner_hash");
      expect(draft).toContain(`UPDATE "${table}"`);
    }
  });

  it("keeps briefs date uniqueness compatible until production cutover is approved", () => {
    expect(draft).toContain("\"briefs_owner_date_unique_idx\"");
    expect(draft).not.toMatch(/DROP\s+(?:INDEX|CONSTRAINT).*briefs/i);
  });

  it("does not contain destructive SQL", () => {
    expect(draft).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(draft).not.toMatch(/\bTRUNCATE\b/i);
    expect(draft).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(draft).not.toMatch(/\bCASCADE\b/i);
  });
});
