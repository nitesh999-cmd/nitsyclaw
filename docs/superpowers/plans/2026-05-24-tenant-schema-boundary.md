# Tenant Schema Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move NitsyClaw from private-owner storage toward safe multi-customer storage without applying any irreversible production migration until Nitesh approves it.

**Architecture:** Keep private-owner mode working while adding explicit tenant boundaries to every customer-owned row. The first migration adds `owner_hash` with a safe default, then repository APIs are changed to require `TenantContext`, then dashboard and WhatsApp callers pass the current owner, and only after tests pass can public-sale readiness be considered.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest, Next.js App Router, WhatsApp bot router.

---

## Non-Negotiable Safety Rules

- This plan is documentation only until Nitesh explicitly approves a migration.
- Do not change production schema from this plan alone.
- Do not enable `NITSYCLAW_PUBLIC_SALE_MODE=1`.
- Do not set `NITSYCLAW_TENANT_ISOLATION=verified`.
- Do not remove historical rows.
- Do not change Railway production data during implementation without a fresh backup and explicit approval.
- Existing private-owner behavior must keep working with `privateOwnerTenant("owner")`.

## File Structure

- Modify: `packages/shared/src/db/schema.ts`
  - Adds `ownerHash` columns and tenant-aware indexes to blocked customer data tables.
- Create: `packages/shared/drizzle/0008_tenant_owner_hash.sql`
  - Adds safe defaulted `owner_hash` columns and indexes.
- Modify: `packages/shared/src/db/repo.ts`
  - Changes blocked-table repository functions to accept `TenantContext` and filter by `ownerHash`.
- Modify: `packages/shared/src/tenancy.ts`
  - Marks migrated tables as `tenant_scoped` only after code and migration are both ready.
- Modify callers:
  - `packages/shared/src/agent/memory.ts`
  - `packages/shared/src/features/02-voice-capture.ts`
  - `packages/shared/src/features/03-reminders.ts`
  - `packages/shared/src/features/04-morning-brief.ts`
  - `packages/shared/src/features/07-schedule-call.ts`
  - `packages/shared/src/features/10-receipt-expense.ts`
  - `packages/shared/src/features/13-personal-lists.ts`
  - `packages/shared/src/features/15-spotify.ts`
  - `packages/shared/src/features/18-email-drafts.ts`
  - `apps/bot/src/router.ts`
  - `apps/dashboard/src/app/reminders/page.tsx`
  - `apps/dashboard/src/app/expenses/page.tsx`
- Create tests:
  - `packages/shared/src/db/repo-tenant-scope.test.ts`
  - `tenant-schema-boundary-plan.test.ts`
- Modify: `scripts/tenant-access-inventory.ts`
  - Treat tenant-scoped repository calls as guarded only when the function requires `TenantContext`.

## Target Table Design

| Table | New boundary | Required read/write rule | Index or uniqueness |
|---|---|---|---|
| `memories` | `owner_hash text not null default 'owner'` | All memory reads/writes filter by `owner_hash` | `(owner_hash, created_at)` and `(owner_hash, kind)` |
| `reminders` | `owner_hash text not null default 'owner'` | All reminder reads/writes filter by `owner_hash` | `(owner_hash, status, fire_at)` |
| `expenses` | `owner_hash text not null default 'owner'` | All expense reads/writes filter by `owner_hash` | `(owner_hash, occurred_at)` |
| `briefs` | `owner_hash text not null default 'owner'` | One daily brief per owner per date | unique `(owner_hash, for_date)` |
| `confirmations` | `owner_hash text not null default 'owner'` | Approval lookup/update always filters by `owner_hash` | `(owner_hash, status, expires_at)` |

## Task 1: Lock the Migration Contract in Tests

**Files:**
- Create: `tenant-schema-boundary-plan.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant schema boundary plan", () => {
  const plan = readFileSync("docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md", "utf8");

  it("defines owner_hash for every blocked customer table", () => {
    for (const table of ["memories", "reminders", "expenses", "briefs", "confirmations"]) {
      expect(plan).toContain(`\`${table}\``);
      expect(plan).toContain("owner_hash text not null default 'owner'");
    }
  });

  it("keeps migration application approval-gated", () => {
    expect(plan).toContain("Do not change production schema from this plan alone.");
    expect(plan).toContain("fresh backup and explicit approval");
  });
});
```

- [ ] **Step 2: Run the test**

Run:

```powershell
pnpm exec vitest run tenant-schema-boundary-plan.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md tenant-schema-boundary-plan.test.ts
git commit -m "docs: define tenant schema boundary plan"
```

## Task 2: Add the Drizzle Schema Shape

**Files:**
- Modify: `packages/shared/src/db/schema.ts`
- Test: `packages/shared/src/db/repo-tenant-scope.test.ts`

- [ ] **Step 1: Add schema columns**

Add `ownerHash: text("owner_hash").notNull().default("owner")` to `memories`, `reminders`, `expenses`, `briefs`, and `confirmations`.

- [ ] **Step 2: Add table indexes**

Use the existing Drizzle callback style:

```ts
ownerCreatedIdx: index("memories_owner_created_idx").on(t.ownerHash, t.createdAt)
ownerStatusFireIdx: index("reminders_owner_status_fire_idx").on(t.ownerHash, t.status, t.fireAt)
ownerOccurredIdx: index("expenses_owner_occurred_idx").on(t.ownerHash, t.occurredAt)
ownerDateUniqueIdx: uniqueIndex("briefs_owner_date_unique_idx").on(t.ownerHash, t.forDate)
ownerStatusExpiresIdx: index("confirmations_owner_status_expires_idx").on(t.ownerHash, t.status, t.expiresAt)
```

- [ ] **Step 3: Generate the migration locally**

Run:

```powershell
pnpm run db:generate
```

Expected: a new Drizzle migration is generated. Review it before committing.

- [ ] **Step 4: Review migration for safe operations**

Expected migration properties:

```sql
ALTER TABLE "memories" ADD COLUMN "owner_hash" text DEFAULT 'owner' NOT NULL;
ALTER TABLE "reminders" ADD COLUMN "owner_hash" text DEFAULT 'owner' NOT NULL;
ALTER TABLE "expenses" ADD COLUMN "owner_hash" text DEFAULT 'owner' NOT NULL;
ALTER TABLE "briefs" ADD COLUMN "owner_hash" text DEFAULT 'owner' NOT NULL;
ALTER TABLE "confirmations" ADD COLUMN "owner_hash" text DEFAULT 'owner' NOT NULL;
```

The generated migration may need manual review for the existing `briefs.for_date` unique constraint. If the generator tries to remove or replace uniqueness, stop and split that into a separate approved migration.

- [ ] **Step 5: Run checks**

```powershell
pnpm typecheck
pnpm exec vitest run tenant-migration-plan.test.ts packages/shared/test/tenant-boundaries.test.ts
```

Expected: pass.

## Task 3: Require Tenant Context in Repository APIs

**Files:**
- Modify: `packages/shared/src/db/repo.ts`
- Modify: `packages/shared/src/db/repo-tenant-guard.test.ts`
- Create: `packages/shared/src/db/repo-tenant-scope.test.ts`

- [ ] **Step 1: Change function signatures**

Use this pattern for blocked-table functions:

```ts
import { type TenantContext, requireTenantContext } from "../tenancy.js";

export async function insertMemory(db: DB, tenant: TenantContext, m: NewMemory) {
  const { ownerHash } = requireTenantContext(tenant);
  const [row] = await db.insert(memories).values({ ...m, ownerHash }).returning();
  return row!;
}
```

- [ ] **Step 2: Filter reads and updates**

Use this pattern:

```ts
const { ownerHash } = requireTenantContext(tenant);
return db
  .select()
  .from(reminders)
  .where(and(eq(reminders.ownerHash, ownerHash), eq(reminders.status, "pending")));
```

For updates/deletes, include both `id` and `ownerHash` in the predicate.

- [ ] **Step 3: Keep private-owner compatibility at callers**

Callers that do not yet have a multi-customer session must pass:

```ts
privateOwnerTenant(hashPhone(ctx.userPhone))
```

For internal private-owner jobs where no phone exists, pass:

```ts
privateOwnerTenant("owner")
```

- [ ] **Step 4: Run focused tests**

```powershell
pnpm exec vitest run packages/shared/src/db/repo-tenant-scope.test.ts packages/shared/src/db/repo-tenant-guard.test.ts
pnpm run tenant:access-inventory
```

Expected: repository findings stay guarded and tenant-scope tests prove owner A cannot read/update owner B rows.

## Task 4: Update WhatsApp and Dashboard Callers

**Files:**
- Modify the caller list from the File Structure section.

- [ ] **Step 1: WhatsApp bot caller rule**

In `apps/bot/src/router.ts`, use the existing owner phone hash:

```ts
const tenant = privateOwnerTenant(hashPhone(this.ownerPhone));
```

Pass `tenant` to reminder and expense repository calls.

- [ ] **Step 2: Feature caller rule**

For feature contexts with `ctx.userPhone`, use:

```ts
const tenant = privateOwnerTenant(hashPhone(ctx.userPhone));
```

Pass it into memory, reminder, brief, expense, and confirmation repository calls.

- [ ] **Step 3: Dashboard caller rule**

For dashboard pages and routes, use:

```ts
const { ownerHash } = getOwnerIdentity();
const tenant = privateOwnerTenant(ownerHash);
```

Pass `tenant` to repository calls.

- [ ] **Step 4: Run smoke checks**

```powershell
pnpm run whatsapp:smoke
pnpm lint
pnpm typecheck
```

Expected: pass.

## Task 5: Split the `briefs` Uniqueness Change

**Files:**
- Modify only after approval: generated migration file.

- [ ] **Step 1: Confirm current production data**

Before changing uniqueness, run a read-only duplicate check in a Railway shell or approved DB client:

```sql
SELECT owner_hash, for_date, COUNT(*)
FROM briefs
GROUP BY owner_hash, for_date
HAVING COUNT(*) > 1;
```

Expected: zero rows.

- [ ] **Step 2: Apply uniqueness only after approval**

The target is:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "briefs_owner_date_unique_idx"
ON "briefs" ("owner_hash", "for_date");
```

Do not remove the existing date-only uniqueness until the app has been deployed and verified with owner-scoped writes.

## Task 6: Public-Sale Readiness Gate

**Files:**
- Modify: `packages/shared/src/tenancy.ts`
- Modify: `packages/shared/test/tenant-boundaries.test.ts`

- [ ] **Step 1: Mark tables tenant-scoped only after implementation**

Change blocked table entries from `single_owner_only` to `tenant_scoped` only after:

```powershell
pnpm run tenant:access-inventory
pnpm run tenant:migration-plan
pnpm run whatsapp:smoke
pnpm lint
pnpm typecheck
```

all pass.

- [ ] **Step 2: Keep public-sale flags blocked until auth is real**

Even after storage is tenant-scoped, `safeForPublicSale` must require:

```text
NITSYCLAW_AUTH_MODEL=multi-user
NITSYCLAW_TENANT_ISOLATION=verified
```

Do not set these in production until dashboard account/session boundaries are reviewed.

## Verification Gate

Before asking for migration approval, run:

```powershell
pnpm run tenant:access-inventory
pnpm run tenant:migration-plan
pnpm run whatsapp:smoke
pnpm exec vitest run packages/shared/src/db/repo-tenant-scope.test.ts packages/shared/test/tenant-boundaries.test.ts dashboard-customer-data-routes.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Expected:

- All commands pass.
- `tenant:access-inventory` shows repository access guarded.
- New tenant-scope tests prove cross-owner reads/updates fail.
- Public sale remains blocked until auth and isolation flags are verified.

## Rollback Strategy

Application rollback:

```powershell
git revert <tenant-repo-change-commit>
```

Database rollback preference:

- Keep added `owner_hash` columns and indexes if they are harmless.
- Roll back application code first.
- Restore from a pre-migration backup if a uniqueness change causes bad writes.

## Stop Conditions

Stop and ask Nitesh before continuing if:

- The generated migration alters existing uniqueness on `briefs`.
- Any test requires production data to pass.
- Any direct page query cannot be tenant-scoped without changing auth/session logic.
- Any caller has no reliable owner identity.
- Any command needs Railway production write access.
