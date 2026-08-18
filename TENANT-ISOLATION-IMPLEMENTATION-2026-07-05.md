# Tenant Isolation Implementation - 2026-07-05

## 1. Executive Result

This pass implemented the approved tenant/data-ownership boundary for exactly five domains:

- memories
- reminders
- expenses
- briefs
- confirmations

No routing/runtime redesign, NWP V2 AUTO work, integrations, UI polish, Feature 34+ work, deploy, push, or commit was performed.

The scoped implementation is code-verified but not production-verified. New repository-mediated writes now stamp `owner_hash`, and repository/dashboard/tool reads and mutations for the five domains now constrain by `owner_hash`. Existing production rows still require a deterministic owner-hash backfill before release, and release preflight remains blocked by a local `.env.local` file inside the repo working directory.

Prior audit evidence that justified the pass:

- `C:\Users\Nitesh\Documents\Codex\2026-07-05\perform-a-forensic-product-and-engineering\outputs\nitsyclaw-readonly-audit-2026-07-05.md:21` recorded `tenant readiness: safe_for_public_sale=no` and `code_ready_for_public_sale=no`.
- `C:\Users\Nitesh\Documents\Codex\2026-07-05\perform-a-forensic-product-and-engineering\outputs\nitsyclaw-readonly-audit-2026-07-05.md:42` to `:55` identified the five domains as storage-isolation blockers.
- `C:\Users\Nitesh\Documents\Codex\2026-07-05\perform-a-forensic-product-and-engineering\outputs\nitsyclaw-readonly-audit-2026-07-05.md:246` to `:252` recommended owner/tenant columns plus cross-owner regression tests.

## 2. Identity Model Found

The canonical scoped owner identity is `ownerHash`, derived from `hashPhone(ownerPhone)`.

Evidence:

- `packages/shared/src/tenancy.ts:133` to `:149` makes empty owner hashes fail closed and maps `privateOwnerTenantForPhone(phone)` to `hashPhone(phone)`.
- `apps/dashboard/src/lib/dashboard-runtime.ts:9` to `:14` resolves dashboard identity from `WHATSAPP_OWNER_NUMBER` into `{ ownerPhone, ownerHash }`.
- `apps/bot/src/router.ts:2073` to `:2078`, `:2108` to `:2114`, and `:2168` to `:2172` pass `hashPhone(this.ownerPhone)` into the voice, receipt, and CSV helper paths.

The system is still private-owner, not multi-account. The owner hash is now a row boundary for the scoped domains, not a complete customer/account model.

## 3. Ownership Invariant

Invariant implemented for the scoped pass:

Every persisted row in `memories`, `reminders`, `expenses`, `briefs`, and `confirmations` must carry exactly one `owner_hash`; every read/write/delete/list/action path for those domains must constrain by the resolved owner hash; missing or blank owner context must fail closed.

Evidence:

- `packages/shared/src/tenancy.ts:133` to `:140` rejects blank owner hashes.
- `packages/shared/src/tenancy.ts:152` to `:156` rejects missing tenant context.
- `packages/shared/src/db/repo.ts:81` to `:84`, `:132` to `:135`, `:190` to `:193`, `:222` to `:227`, and `:230` to `:241` stamp inserts/upserts with `context.ownerHash`.
- `packages/shared/test/tenant-owner-isolation.test.ts:27` to `:106` adds adversarial owner A/owner B isolation tests across all five domains.

## 4. Domain-by-Domain Path Map

Memories:

- WhatsApp memory tool path derives `ownerHash` from `ctx.userPhone`, then uses `recallMemoryForOwner` and `pinMemory`. Evidence: `packages/shared/src/features/06-memory-recall.ts:18` to `:43`, `packages/shared/src/agent/memory.ts:12` to `:33`.
- Voice capture stores transcript memory with required `ownerHash`. Evidence: `packages/shared/src/features/02-voice-capture.ts:10` to `:24`.
- Repository insert/search/update/delete stamp/filter owner. Evidence: `packages/shared/src/db/repo.ts:81` to `:129`.
- Dashboard memory page, review API, search API, export, and delete are owner-filtered. Evidence: `apps/dashboard/src/app/memory/page.tsx:13` to `:27`, `apps/dashboard/src/app/api/memory/review/route.ts:63` to `:68`, `apps/dashboard/src/app/api/data/export/route.ts:62`, `apps/dashboard/src/app/api/data/delete/route.ts:112` to `:120`.

Reminders:

- Reminder repository insert/list/due/fire/cancel/reschedule paths stamp/filter owner. Evidence: `packages/shared/src/db/repo.ts:132` to `:187`.
- Dashboard reminder create/list/reschedule paths use owner identity. Evidence: `apps/dashboard/src/app/reminders/page.tsx:27` to `:68`, `:222` to `:226`.
- Orphan radar filters reminders by owner. Evidence: `packages/shared/src/features/32-orphan-radar.ts:30` to `:47`.

Expenses:

- Receipt image and CSV imports require owner hash before inserting expenses. Evidence: `packages/shared/src/features/10-receipt-expense.ts:54` to `:66`, `:142` to `:156`, `:213` to `:217`.
- Expense repository range reads filter owner. Evidence: `packages/shared/src/db/repo.ts:190` to `:219`.
- Dashboard expense list/export/stats use `expenseWhere(..., ownerHash)`. Evidence: `apps/dashboard/src/lib/expense-utils.ts:33` to `:34`, `apps/dashboard/src/app/expenses/page.tsx:34` to `:55`, `apps/dashboard/src/app/api/expenses/export/route.ts:39` to `:44`.

Briefs:

- Brief upsert now takes tenant context and conflicts on `(ownerHash, forDate)`. Evidence: `packages/shared/src/db/repo.ts:222` to `:227`.
- Schema removes the global date-only uniqueness assumption by adding `briefs_owner_date_unique_idx`. Evidence: `packages/shared/src/db/schema.ts:115` to `:122`, `packages/shared/drizzle/0010_tenant_owner_hash_scoped_domains.sql:44` to `:46`.
- Export/delete paths are owner-filtered for briefs. Evidence: `apps/dashboard/src/app/api/data/export/route.ts:65`, `apps/dashboard/src/app/api/data/delete/route.ts:126`.

Confirmations:

- Confirmation insert/status/latest/by-id/prune paths stamp/filter owner. Evidence: `packages/shared/src/db/repo.ts:230` to `:308`, `:488` to `:495`.
- Confirmation resolution requires user phone and scopes lookups through tenant context. Evidence: `packages/shared/src/features/09-confirmation-rail.ts:27` to `:70`.
- Dashboard confirmation reject/list/read paths use owner identity. Evidence: `apps/dashboard/src/app/confirmations/page.tsx:25` to `:43`, `:78` to `:79`.

## 5. Database and Schema Changes

Schema changes:

- `memories.owner_hash`: `packages/shared/src/db/schema.ts:50`; owner indexes at `:59` and `:60`.
- `reminders.owner_hash`: `packages/shared/src/db/schema.ts:71`; owner/status/fire index at `:81`.
- `expenses.owner_hash`: `packages/shared/src/db/schema.ts:92`; owner/occurred index at `:104`.
- `briefs.owner_hash`: `packages/shared/src/db/schema.ts:115`; owner/date unique index at `:122`.
- `confirmations.owner_hash`: `packages/shared/src/db/schema.ts:209`; owner/status/expires index at `:217`.

Migration changes:

- `packages/shared/drizzle/0010_tenant_owner_hash_scoped_domains.sql:1` to `:57` adds the scoped columns, backfills nulls to the legacy sentinel `owner`, sets not-null/default constraints, adds indexes, drops global brief date uniqueness, and creates owner/date uniqueness.
- `packages/shared/drizzle/meta/_journal.json` registers the migration.

Important residual schema risk:

- The schema and migration retain `.default("owner")` / default `'owner'` for compatibility with legacy rows and insert types. Repository-mediated writes override this with `context.ownerHash`, but direct DB writes outside the repository can still create sentinel-owned rows. This is contained for this pass by repository enforcement plus the backfill script, but it is not a final public-sale database invariant.

## 6. Service and Tool Boundary Changes

Service/tool entry points were changed only where they touch the five scoped domains:

- `packages/shared/src/agent/memory.ts:12` to `:33` requires owner hash for pin/recall helpers and makes the old ownerless recall path throw.
- `packages/shared/src/features/02-voice-capture.ts:10` to `:24` requires owner hash for transcript storage.
- `packages/shared/src/features/05-whats-on-my-plate.ts:17` to `:64` scopes today's summary by owner phone.
- `packages/shared/src/features/06-memory-recall.ts:18` to `:43` derives owner hash for recall/pin memory tools.
- `packages/shared/src/features/09-confirmation-rail.ts:27` to `:70` scopes confirmation resolution by user phone.
- `packages/shared/src/features/10-receipt-expense.ts:54` to `:66` and `:142` to `:156` require owner hash for receipt/CSV expenses.
- `packages/shared/src/features/32-orphan-radar.ts:30` to `:47` validates owner context and filters reminder reads.
- `apps/bot/src/router.ts:2073` to `:2172` passes owner hash to the affected media/CSV paths.

## 7. Legacy-Data Migration and Backfill

The Drizzle migration backfills missing `owner_hash` values to the legacy sentinel `owner`. That keeps the migration safe for unknown existing data, but runtime identity now resolves to `hashPhone(WHATSAPP_OWNER_NUMBER)`, so production data needs an explicit backfill from `owner` to the real owner hash.

Backfill support added:

- `scripts/backfill-scoped-owner-hash.ts:8` to `:14` limits the script to the five approved tables.
- `scripts/backfill-scoped-owner-hash.ts:43` to `:50` requires `WHATSAPP_OWNER_NUMBER` and a database URL, then computes `hashPhone(ownerPhone)`.
- `scripts/backfill-scoped-owner-hash.ts:54` to `:62` defaults to dry-run.
- `scripts/backfill-scoped-owner-hash.ts:65` to `:78` only updates rows whose owner hash is null or `owner` when `--apply` is supplied.
- `package.json` adds `tenant:owner-backfill`.

Verified script behavior:

- `corepack pnpm@10.33.2 run tenant:owner-backfill -- --help` passed and printed usage/default/scope.

Not verified:

- The script was not run against the production database in dry-run or apply mode.
- The migration was not applied to production.
- No production candidate-row counts were captured.

## 8. Adversarial Tests Added

New adversarial test file:

- `packages/shared/test/tenant-owner-isolation.test.ts:27` to `:39` proves owner A cannot read/update/delete owner B memories.
- `packages/shared/test/tenant-owner-isolation.test.ts:41` to `:51` proves owner A cannot read/mutate owner B reminders.
- `packages/shared/test/tenant-owner-isolation.test.ts:53` to `:74` proves owner A cannot read owner B expenses.
- `packages/shared/test/tenant-owner-isolation.test.ts:76` to `:86` proves briefs are unique by owner/date, not global date.
- `packages/shared/test/tenant-owner-isolation.test.ts:88` to `:106` proves owner A cannot read/mutate/prune owner B confirmations.

Supporting test infrastructure:

- `packages/shared/test/helpers.ts` now supports owner-aware inserts, deletes, transactions, composite brief upserts, and reminder defaults.
- Existing tests were updated in `packages/shared/test/02-voice-capture.test.ts`, `packages/shared/test/03-reminders.test.ts`, `packages/shared/test/05-whats-on-my-plate.test.ts`, `packages/shared/test/06-memory-recall.test.ts`, `packages/shared/test/09-confirmation-rail.test.ts`, `packages/shared/test/10-receipt-expense.test.ts`, `packages/shared/test/tenant-boundaries.test.ts`, `packages/shared/src/db/repo-tenant-guard.test.ts`, and `apps/dashboard/src/lib/expense-utils.test.ts`.

## 9. Post-Change Access-Path Inventory

Static inventory command:

`corepack pnpm@10.33.2 run tenant:access-inventory`

Result:

- Passed.
- `tenant_access_inventory=findings`
- `findings=61`
- All reported access paths were `guarded=yes`.

Interpretation:

- This supports the scoped claim that known direct five-domain access paths are now guarded.
- It does not prove public-sale readiness because out-of-scope domains remain in `review`, dashboard auth remains single-owner, and direct DB access outside the repository can still bypass code-level guards.

## 10. Exact Commands and Test Results

Verification performed:

- `corepack pnpm@10.33.2 exec vitest run`
  - Passed.
  - `204` test files passed.
  - `965` tests passed.
- `corepack pnpm@10.33.2 -r typecheck`
  - Passed for shared, bot, and dashboard.
- `corepack pnpm@10.33.2 lint`
  - Exited 0.
  - Remaining warnings were unrelated/pre-existing unused-disable or unused-variable warnings in `apps/bot/src/adapters.ts`, `packages/shared/src/notify/index.ts`, `packages/shared/test/25-daily-focus.test.ts`, `packages/shared/test/26-snooze.test.ts`, and `packages/shared/test/30-auto-extract.test.ts`.
- `corepack pnpm@10.33.2 build`
  - Passed.
  - Bot TypeScript build passed.
  - Dashboard `next build --webpack` passed.
- `corepack pnpm@10.33.2 run tenant:check`
  - Passed.
  - `tenant_mode=private-owner`
  - `code_ready_for_public_sale=yes`
  - `safe_for_public_sale=no`
  - Scoped tables reported `memories=ok:owner_hash`, `reminders=ok:owner_hash`, `expenses=ok:owner_hash`, `briefs=ok:owner_hash`, `confirmations=ok:owner_hash`.
  - Remaining review tables reported: `messages`, `feature_requests`, `audit_log`, `dashboard_auth_attempts`.
- `corepack pnpm@10.33.2 run tenant:access-inventory`
  - Passed.
  - `findings=61`, all guarded.
- `corepack pnpm@10.33.2 run tenant:owner-backfill -- --help`
  - Passed.
- `git diff --check`
  - Passed with line-ending warnings only.
- `corepack pnpm@10.33.2 run release:preflight`
  - Failed at the local secret/session file check because `.env.local` exists inside the repo working directory.

Dependency repair note:

- An earlier `pnpm exec` path attempted to use pnpm 11 and touched local module links. Local dependencies were repaired with `corepack pnpm@10.33.2 install --frozen-lockfile --config.confirmModulesPurge=false`. No lockfile or dependency manifest churn was retained except the intentional `tenant:owner-backfill` package script.

## 11. Remaining Unscoped Domains

`packages/shared/src/tenancy.ts:40` to `:90` and `:120` to `:129` still mark these domains as review risks, not verified tenant-scoped storage:

- `messages`: `owner_scoped` by `from_number`, not a first-class tenant ID.
- `feature_requests`: actor hint via `requested_by`, not a strict tenant boundary.
- `audit_log`: still intentionally review-scoped.
- `dashboard_auth_attempts`: keyed by client/network signals, not account-aware identity.

Dashboard data deletion still deletes some out-of-scope tables globally in the `everything` path. Evidence: `apps/dashboard/src/app/api/data/delete/route.ts:115`, `:119`, `:121`, `:122`, `:124`, `:125`, `:127`, and `:128`. The five approved domains are owner-filtered in that route, but the route is not public-sale ready overall.

## 12. Remaining Tenant-Isolation Risks

Ranked residual risks:

1. Production legacy rows may remain under sentinel owner `owner` until `tenant:owner-backfill` is run and verified. Impact: current owner may not see historical memories/reminders/expenses/briefs/confirmations after migration. Evidence: `packages/shared/drizzle/0010_tenant_owner_hash_scoped_domains.sql:3`, `:16`, `:27`, `:38`, `:51`; `scripts/backfill-scoped-owner-hash.ts:65` to `:78`.
2. DB defaults still allow sentinel-owned rows if code writes bypass the repository. Impact: hidden data or future leakage if a later path reads sentinel rows incorrectly. Evidence: `packages/shared/src/db/schema.ts:50`, `:71`, `:92`, `:115`, `:209`.
3. Public-sale readiness is still false because auth and remaining review tables are not verified. Evidence: `packages/shared/src/tenancy.ts:171` to `:204`; `tenant:check` output.
4. Static inventory is not a proof of dynamic runtime coverage. Impact: a future untracked raw SQL path could bypass owner filters. Evidence: `tenant:access-inventory` produced guarded findings, but this is static string/path analysis.
5. The scheduler/worker model remains private-owner. Impact: multi-owner fanout semantics are not designed or tested. Evidence: `tenant:check` output reports `tenant_mode=private-owner`.

## 13. `.env.local` Preflight Finding

Release preflight failed because a local `.env.local` file exists inside the repo working directory.

Evidence:

- `scripts/preflight.ps1:55` to `:57` includes `.env.local` in forbidden repo-local file patterns.
- `scripts/preflight.ps1:115` to `:119` throws when those files are present.
- `docs/release-safety.md:13` says preflight must fail if `.env.local` or other high-risk local files exist inside the repo before release.
- `docs/env-guide.md:3` says `.env.local` is for local work and must not be committed.
- `.gitignore:3` and `.gitignore:5` ignore `.env.local` while allowing `.env.local.example`.

Observed local state:

- `git ls-files --stage .env.local` produced no tracked entry.
- `git status --short --ignored .env.local` reported `!! .env.local`.
- `git check-ignore -v .env.local` reported `.gitignore:59:.env*.local .env.local`.

Interpretation:

- This is not evidence that `.env.local` is committed.
- It is a valid release hygiene blocker according to the repo's own preflight policy.
- The file was not read, printed, moved, or deleted.

## 14. Files Changed

Tracked files changed:

- `apps/bot/src/router.ts`
- `apps/dashboard/src/app/activity/page.tsx`
- `apps/dashboard/src/app/api/data/delete/route.ts`
- `apps/dashboard/src/app/api/data/export/route.ts`
- `apps/dashboard/src/app/api/expenses/export/route.ts`
- `apps/dashboard/src/app/api/memory/review/route.ts`
- `apps/dashboard/src/app/api/search/route.ts`
- `apps/dashboard/src/app/api/stats/route.ts`
- `apps/dashboard/src/app/command/page.tsx`
- `apps/dashboard/src/app/confirmations/page.tsx`
- `apps/dashboard/src/app/expenses/page.tsx`
- `apps/dashboard/src/app/health/page.tsx`
- `apps/dashboard/src/app/memory/page.tsx`
- `apps/dashboard/src/app/onboarding/page.tsx`
- `apps/dashboard/src/app/page.tsx`
- `apps/dashboard/src/app/privacy-center/page.tsx`
- `apps/dashboard/src/app/reminders/page.tsx`
- `apps/dashboard/src/app/search/page.tsx`
- `apps/dashboard/src/app/stats/page.tsx`
- `apps/dashboard/src/lib/expense-utils.ts`
- `apps/dashboard/src/lib/expense-utils.test.ts`
- `apps/dashboard/src/lib/sale-readiness.ts`
- `apps/dashboard/src/lib/sale-readiness.test.ts`
- `package.json`
- `packages/shared/drizzle/meta/_journal.json`
- `packages/shared/src/agent/memory.ts`
- `packages/shared/src/customer-instance.ts`
- `packages/shared/src/customer-instance.test.ts`
- `packages/shared/src/db/repo.ts`
- `packages/shared/src/db/repo-tenant-guard.test.ts`
- `packages/shared/src/db/schema.ts`
- `packages/shared/src/features/02-voice-capture.ts`
- `packages/shared/src/features/05-whats-on-my-plate.ts`
- `packages/shared/src/features/06-memory-recall.ts`
- `packages/shared/src/features/09-confirmation-rail.ts`
- `packages/shared/src/features/10-receipt-expense.ts`
- `packages/shared/src/features/32-orphan-radar.ts`
- `packages/shared/src/tenancy.ts`
- `packages/shared/test/02-voice-capture.test.ts`
- `packages/shared/test/03-reminders.test.ts`
- `packages/shared/test/05-whats-on-my-plate.test.ts`
- `packages/shared/test/06-memory-recall.test.ts`
- `packages/shared/test/09-confirmation-rail.test.ts`
- `packages/shared/test/10-receipt-expense.test.ts`
- `packages/shared/test/helpers.ts`
- `packages/shared/test/tenant-boundaries.test.ts`

New files:

- `packages/shared/drizzle/0010_tenant_owner_hash_scoped_domains.sql`
- `packages/shared/test/tenant-owner-isolation.test.ts`
- `scripts/backfill-scoped-owner-hash.ts`
- `TENANT-ISOLATION-IMPLEMENTATION-2026-07-05.md`

Repo note:

- The worktree also contains unrelated pre-existing untracked junk filenames. They were not cleaned up, deleted, staged, or modified as part of this scoped pass.

## 15. Regression Risks

Regression risks to watch:

- Existing historical data can appear missing until owner-hash backfill is applied against the real owner hash.
- Direct inserts outside `packages/shared/src/db/repo.ts` can still land under default `owner`.
- Dashboard export/delete behavior is improved only for the five approved domains; out-of-scope tables remain globally handled and are not public-sale ready.
- The app still depends on `WHATSAPP_OWNER_NUMBER` as private-owner identity for dashboard scoping.
- `tenant:access-inventory` should be kept in CI/gating because future direct SQL additions can bypass repository guards.
- The release preflight block from `.env.local` must remain treated as a release blocker, not an app test failure.

SCOPED TENANT ISOLATION STATUS: PARTIALLY VERIFIED

THE NEXT OPERATING-CORE PROBLEM TO FIX IS: production legacy owner-hash backfill must be applied and verified before release
