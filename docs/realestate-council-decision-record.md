# Real Estate Engine — Council Decision Record (Isolation P0)

Date: 2026-06-07
Companion to `docs/realestate-revenue-engine-plan.md`, `docs/realestate-workflow-spec.md`, and the existing `docs/tenant-boundary-migration-plan.md` + `docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md`.
Status: investigation complete; one additive tripwire test shipped; **no runtime/source behavior changed**.

## Verdict accepted: GO-WITH-CHANGES — isolation is P0 critical path, NOT a parallel task

The single correction that governs everything: **the multi-tenant memory-isolation migration gates onboarding tenant #2 and must ship + be proven green before any second agency's real leads touch the engine.** Pilot #1 can run now on a single isolated instance (one tenant cannot leak to itself). This record converts the council's finding into code-grounded scope.

## The leak is reproduced (not theoretical)

`packages/shared/test/re-tenant-isolation.test.ts` — run result: **1 passed | 1 expected-fail (green).**
- The `it.fails` behavioral test writes a memory under Agency A (`+1555000-1111`) and shows Agency B (`+1555000-2222`) can currently recall it via `searchMemoriesLexical`. It "fails as expected" today; it flips RED the moment isolation works, forcing the fixer to remove `.fails` and keep the now-true assertion. Self-clearing tripwire.
- A structural test asserts `tenantBoundaryFor("memories").scopeColumn === null` — goes RED when the scope column is added.

## Blast radius — grep evidence

Command basis: grep for `privateOwnerTenant`, `tenantId:"owner"`, `scopeColumn:null`, and all callers of `recallMemory`/`searchMemoriesLexical`/`insertMemory`, plus any vector path.

**Root cause (one fact):** the `memories`/`reminders`/`expenses`/`briefs`/`confirmations` tables have **no owner/tenant column** (`tenancy.ts` marks each `scopeColumn: null`, `publicSaleRisk: "blocked"`). So even when callers pass a per-phone tenant, `searchMemoriesLexical` (`repo.ts:87`) filters only `WHERE lower(content) LIKE q` — there is no column to scope on. The tenant arg reaches `guardUnscopedCustomerDataAccess` (`repo.ts:39-42`) but never the `WHERE`.

**Two distinct gaps:**
1. **Storage gap (5 tables):** no scope column on memories/reminders/expenses/briefs/confirmations.
2. **Recall gap (active leak path):** `agent/memory.ts:15,29` — `pinMemory`/`recallMemory` hardcode `privateOwnerTenant()` ("owner"), discarding even the per-phone context. `features/13-personal-lists.ts:46,83` and `features/06-memory-recall.ts:17` reach the same unscoped `searchMemoriesLexical`.

**Callers that already thread per-phone tenant** (so they're ready once the column exists): `features/03-reminders.ts`, `04-morning-brief.ts`, `10-receipt-expense.ts`, `02-voice-capture.ts` (handler path), `09-confirmation-rail.ts`, `apps/bot/src/router.ts:230`, `apps/bot/src/scheduler.ts:146`, dashboard `reminders/expenses/confirmations` pages. The plumbing is half-done; the missing piece is the column + the `WHERE` + fixing `agent/memory.ts`.

## Answers to the council's three clarifying questions

**Q1 — Is there a vector/semantic recall path with no tenant filter?**
Partly latent, not yet active. Embeddings are *written* (`agent/memory.ts:14` via `text-embedding-3-small`, stored as JSON text in `memories.embedding`), but **there is no semantic/cosine retrieval query anywhere** — `repo.ts:83-85` says lexical search is the v1 stand-in "until pgvector cosine search" exists. So today's only retrieval leak is the lexical path. **Flag:** when pgvector cosine search is implemented, it MUST carry the same tenant filter, or it reintroduces the leak. Add it to the migration's definition-of-done.

**Q2 — Is `assertCustomerInstanceCanSell()` wired to the live ingestion path, or dead code?**
The council's catch is correct: **`assertCustomerInstanceCanSell()` is only called by its own unit test** (`customer-instance.test.ts:59`) — it gates nothing at runtime.
**However** — better news than assumed — a *different* guard IS wired: `assertPublicSaleTenantBoundaries()` runs inside `guardUnscopedCustomerDataAccess` on **every** customer-data repo call (`repo.ts:41`) and on ~15 dashboard pages. It throws if `NITSYCLAW_PUBLIC_SALE_MODE=1` while blocked tables exist. Net: you **cannot flip on public-sale mode** without the repo layer throwing — a real fail-closed gate. **Its gap:** it does nothing about two phone numbers run through *private* mode sharing the unscoped memory pool. So the council's per-onboarding `activeTenants > 1` guard is genuinely additive, not redundant — it closes exactly the private-mode multi-tenant hole the mode flag misses.

**Q3 — Correct tenant boundary: agency, office, or agent?**
Code's de-facto scope unit is `ownerHash = hashPhone(phone)` (`tenancy.ts:141`). Cleanest mapping for RE: **one tenant = one agency inbound number.** BUT this collides with the earlier brief's "principal may not own the lead": in agent-owns-lead models the *agent* controls the lead, which may force agent-level or office-level scoping. **This is a product+legal decision the operator must make before the schema is written** — it determines whether the new column is `agency_id` alone or `agency_id` + `agent_id`. Open.

## Backfill disposition (council asked)

All existing `memories`/`reminders`/`expenses`/`briefs`/`confirmations` rows belong to the single private owner. On migration: add the scope column NOT NULL with a default of the private owner's hash, backfill every existing row to that owner, then drop the default and require explicit tenant context on all writes. No data loss; existing private-owner behavior preserved (aligns with `superpowers/plans/2026-05-24-tenant-schema-boundary.md` which requires `privateOwnerTenant("owner")` to keep working).

## The non-bypassable guard — specced, NOT yet implemented

The council's recommended runtime lock:
```
if (distinctActiveTenants > 1 && memoriesTableIsUnscoped()) {
  throw new Error("Multi-tenant onboarding locked until RE isolation migration is green.");
}
```
**Why not shipped this turn:** (a) it changes live runtime behavior and could break the existing single-owner path or CI if "active tenant" is mis-defined; (b) its exact key depends on the unresolved Q3 boundary decision. Implementing it blind would violate "make the smallest safe change" and risk a false sense of safety. **Recommendation:** implement it as part of the migration ticket, keyed to the same scope column, once Q3 is answered. Until then, the shipped tripwire test + the wired `assertPublicSaleTenantBoundaries()` mode gate are the active protections, and the operating rule below holds.

## Operating rule until migration is green

**Do not run a second agency's leads through the engine.** Pilot #1 only, single owner/instance. This is now also encoded as a CI tripwire that turns red if isolation is "fixed" so it can't be silently half-done.

## Resequenced next actions (replaces "parallel")

1. **(Decision, operator)** Answer Q3: is a tenant an agency, an office, or an agent? Blocks schema.
2. **(Decision, operator)** Answer the consent/lead-source question (Facebook+web-form-owned-consent only; avoid agent-owned-lead portals at launch) — run the half-day consent-screenshot test.
3. **(Build, on approval)** Execute the isolation migration per `tenant-boundary-migration-plan.md`: add scope column to the 5 tables, fix `agent/memory.ts` to thread real tenant context, add the `WHERE` filter to `searchMemoriesLexical` (and pre-emptively to the future cosine path), backfill, add the non-bypassable guard, and flip the tripwire test to assert isolation.
4. **(Parallel, safe)** Start A2P 10DLC brand registration clock and Pilot #1 on a single isolated instance.

## Operator addendum (per CLAUDE.md)

1. **Next best revenue move:** Pilot #1 on a single isolated instance + start the 10DLC clock — the only revenue actions that are safe *before* the migration, and both are unblocked today.
2. **Failure-prevention move:** Answer Q3, then ship the isolation migration and flip the tripwire green before any tenant #2. The reproduced leak is the most likely company-ending incident on the board.
3. **Recommendation:** Do the two operator decisions (Q3 + consent) now — they cost an afternoon, unblock both the schema and the legal posture, and nothing else (migration, guard, second pilot) can correctly proceed until they're answered.
