# Tenant boundary migration plan

This is the safe plan for moving NitsyClaw from private-owner storage toward a sellable multi-customer product.

Status: planning only. Do not run a production schema migration from this document.

## Goal

Every customer-owned row must have a tenant boundary before public sale mode can be enabled.

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
