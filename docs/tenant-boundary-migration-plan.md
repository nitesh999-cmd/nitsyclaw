# Tenant boundary migration plan

This is the safe plan for moving NitsyClaw from private-owner storage toward a sellable multi-customer product.

Status: planning only. Do not run a production schema migration from this document.

Execution-grade plan: `docs/superpowers/plans/2026-05-24-tenant-schema-boundary.md`.

That plan is the next implementation checklist. It is still approval-gated: it defines what to build, but it does not grant permission to run a production schema migration.

## Goal

Every customer-owned row must have a tenant boundary before public sale mode can be enabled.

## First customer-instance model

The first sellable model is now represented in code by `packages/shared/src/customer-instance.ts`.

Current rule:

- `private-owner` + `personal` is allowed for Nitesh's own use.
- `customer` + `pilot` is allowed only as a supervised pilot while tenant storage is still incomplete.
- `customer` + `public-sale` is blocked until tenant storage, multi-user auth, and public-sale readiness checks pass.

Run:

```powershell
pnpm run customer:check
```

This prints whether the current runtime is personal-use only, pilot-ready with human setup, or publicly sellable. It does not print secrets and does not mutate the database.

Before changing tenant storage, run:

```powershell
pnpm run tenant:access-inventory
```

This prints the current unscoped customer-data access points for the blocking tables. Use that output as the worklist for replacing direct global reads/writes with tenant-scoped repository calls.

## Current blocking tables

| Table | Current issue | Planned boundary |
|---|---|---|
| `memories` | No tenant column | Add `owner_hash text not null default 'owner'`, index `(owner_hash, created_at)` |
| `reminders` | No tenant column | Add `owner_hash text not null default 'owner'`, index `(owner_hash, status, fire_at)` |
| `expenses` | No tenant column | Add `owner_hash text not null default 'owner'`, index `(owner_hash, occurred_at)` |
| `briefs` | Date is globally unique | Add `owner_hash text not null default 'owner'`, replace date-only uniqueness with `(owner_hash, for_date)` |
| `confirmations` | Risky approvals are not tenant-bound | Add `owner_hash text not null default 'owner'`, index `(owner_hash, status, expires_at)` |

## Review-needed tables

| Table | Risk | Planned action |
|---|---|---|
| `messages` | Scoped by hashed sender/contact, not tenant ID | Keep for private-owner mode; add tenant context before commercial WhatsApp Cloud API migration |
| `feature_requests` | `requested_by` is actor metadata, not tenant isolation | Keep operational queue global until customer self-service exists |
| `audit_log` | Global operational log | Add tenant-aware filtering before exposing logs to customers |
| `dashboard_auth_attempts` | Lockout key is not account-bound | Use account/session-aware lockout with multi-user auth |

## Safe migration order

1. Add nullable/defaulted `owner_hash` columns to blocking tables.
2. Backfill existing rows to `owner`.
3. Add indexes for tenant-scoped reads.
4. Update repository functions to require `TenantContext`.
5. Update dashboard and WhatsApp routes to pass `privateOwnerTenant(hash)` for private mode.
6. Change `briefs` uniqueness from `for_date` to `(owner_hash, for_date)` after backfill.
7. Add tenant-scoped export/delete tests.
8. Only then allow `NITSYCLAW_TENANT_ISOLATION=verified`.

## Approval gates before any live schema change

Before running `pnpm run db:migrate` against Railway or any production database:

1. Run `pnpm run tenant:migration-plan`.
2. Run `pnpm run tenant:access-inventory`.
3. Run `pnpm run whatsapp:smoke`.
4. Run `pnpm lint`.
5. Run `pnpm typecheck`.
6. Take or confirm a fresh database backup.
7. Get explicit approval for the exact migration file being applied.

## Rollback plan

Until repository code depends on new columns, rollback is:

1. Revert the application commit.
2. Leave added columns/indexes in place if harmless.
3. If a bad unique-index change affects `briefs`, restore from the pre-migration backup snapshot before retrying.

## Hard rules

- Do not drop data tables.
- Do not delete historical rows during tenant migration.
- Do not enable public sale mode from env flags alone.
- Do not expose tenant-aware audit logs to customers until redaction and filtering are tested.
