// RE (real estate) multi-tenant isolation — P0 BLOCKER tripwire.
//
// Why this file exists:
// The NitsyClaw engine currently runs single-owner ("private-owner" mode).
// Long-term memory recall (`searchMemoriesLexical`) does NOT filter by tenant
// because the `memories` table has no owner/tenant scope column
// (`tenantBoundaryFor("memories").scopeColumn === null`). If a second agency's
// lead conversations were run through the engine as-is, one agency could recall
// another agency's stored lead facts (budget, financing, address).
//
// These tests convert that diagnosis into a version-controlled, CI-visible
// blocker. They are GREEN today (they assert the *current, leaky* reality).
// When the agency_id isolation migration lands, both tests flip RED on purpose,
// forcing whoever did the migration to update this file to assert isolation
// instead — a self-clearing tripwire. Do NOT delete these to "make CI pass":
// the correct fix is the migration (see docs/realestate-council-decision-record.md
// and docs/tenant-boundary-migration-plan.md).

import { describe, it, expect } from "vitest";
import { insertMemory, searchMemoriesLexical } from "../src/db/repo.js";
import { privateOwnerTenantForPhone, tenantBoundaryFor } from "../src/tenancy.js";
import { makeFakeDb } from "./helpers.js";

describe("RE multi-tenant isolation (P0 blocker — must be fixed before tenant #2)", () => {
  // Behavioral tripwire. `it.fails` asserts the body currently throws — i.e. the
  // isolation expectation does NOT yet hold (memory leaks across tenants).
  // When isolation is implemented, `leaked` becomes empty, the inner expect
  // passes, this test stops failing, and `it.fails` itself turns RED — the
  // signal to remove `.fails` and keep the now-true isolation assertion.
  it.fails(
    "memory recall MUST be isolated per tenant (currently LEAKS across agencies)",
    async () => {
      const { db } = makeFakeDb();
      const agencyA = privateOwnerTenantForPhone("+15550001111");
      const agencyB = privateOwnerTenantForPhone("+15550002222");

      await insertMemory(db, agencyA, {
        kind: "note",
        content: "ALPHALEAD buyer pre-approved budget 920k in Riverside",
        tags: [],
        embedding: null,
      });

      // Agency B searches its own memory. It must NOT see Agency A's lead facts.
      const leaked = await searchMemoriesLexical(db, agencyB, "ALPHALEAD", 10);
      expect(leaked).toHaveLength(0);
    },
  );

  // Structural tripwire: documents that the memories table is not tenant-scoped
  // yet. Goes RED the moment someone adds the scope column in tenancy.ts.
  it("documents that the `memories` table still has no tenant scope column", () => {
    expect(tenantBoundaryFor("memories")?.scopeColumn).toBeNull();
    expect(tenantBoundaryFor("memories")?.publicSaleRisk).toBe("blocked");
  });
});
