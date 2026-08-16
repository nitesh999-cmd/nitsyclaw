# Production rollback

Current production is live state, not a hard-coded value in this file. Verify it first:

```powershell
npx vercel inspect https://nitsyclaw.vercel.app --json --wait --cwd "C:\Users\Nitesh\projects\NitsyClaw"
npx vercel ls nitsyclaw --cwd "C:\Users\Nitesh\projects\NitsyClaw"
```

Public aliases:

- `nitsyclaw.vercel.app`
- `nitsyclaw-dashboard.vercel.app`

Rollback target:

- Use the most recent prior `Ready` production deployment from `npx vercel ls nitsyclaw`.
- The operator performing the deploy must record the exact rollback target in the deploy handoff/final report after production is live.

Dry-run rollback check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl "<previous-ready-production-url>"
```

The helper validates `/api/healthz` for deployments that expose it. If an older rollback target predates `/api/healthz`, it falls back to `/login` and still requires `Cache-Control: no-store`.

Apply rollback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl "<previous-ready-production-url>" -DryRun:$false
```

This restores both production aliases:

- `nitsyclaw.vercel.app`
- `nitsyclaw-dashboard.vercel.app`

Verify after rollback:

```powershell
npx vercel inspect "<previous-ready-production-url>" --wait --cwd "C:\Users\Nitesh\projects\NitsyClaw"
pnpm release:live-smoke
```

Expected result: live smoke passes against `https://nitsyclaw.vercel.app`. If rolling back to a deployment that predates `/api/healthz`, use the rollback helper's `/login` fallback and then manually verify `/login` returns `200` or `307` with `Cache-Control: no-store`.

Database rollback:

**This release includes database migrations.** The previous statement that none was
required described the release before it, and is superseded here as this file's own
rule requires: a release with a migration must name the migration files, the backup
snapshot and the restore command *before* deploy.

Migrations in this release — `packages/shared/drizzle/`:

| Migration | What it does | How it lands |
|---|---|---|
| `0009_wealthy_grandmaster.sql` | `daily_focus` table + unique index | Already applied to Production, but **absent from the journal**. Reconciled by **replay**, not by inserting a journal row: every statement is `IF NOT EXISTS`-guarded, so the replay is a verified no-op and the journal row drizzle then writes is truthful. |
| `0010_tenant_owner_hash_scoped_domains.sql` | `owner_hash` on five tables, six indexes, drops `briefs_for_date_unique` | Same: already applied, unrecorded, reconciled by replay. Its `SET DEFAULT` / `SET NOT NULL` are no-ops when already set, its backfill `UPDATE`s match zero rows because the columns are `NOT NULL`, and the `DROP CONSTRAINT` is `IF EXISTS`. |
| `0011_voice_verification.sql` | `verified_voice_contacts`, `verified_voice_products` | **Additive only.** Applied for real. |
| `0012_voice_proposal_binding.sql` | `voice_verification_proposals`, `voice_verification_confirmations` | **Additive only.** Applied for real. Its one foreign key is confined to the new tables. |

Journal goes from 9 rows (`0000`–`0008`) to 13. No existing table is altered by
`0011`/`0012`, so the previous application build stays schema-compatible and an
application rollback does not require a schema rollback.

Backup snapshot taken before the migration:

- `backups/nitsyclaw-prod-<UTC timestamp>.dump.gpg` — `pg_dump -Fc` streamed directly
  into GPG AES256/OCB, never written to disk in plaintext.
- Release artifact: `nitsyclaw-prod-20260816T100733Z.dump.gpg`,
  `sha256 07dce7fc813bae4c5c5a758134c79a75c4521eddf2ee0ad2c03f798740b213fc`.
- Restore-proven: decrypted and `pg_restore`d into a disposable PostgreSQL 17 instance,
  which matched Production exactly (16 tables, 9 journal rows, identical hashes).
- Supabase PITR is **not enabled**, so the recovery floor is this dump plus the daily
  physical backup. There is no point-in-time option.

Migration command — one operator process, never CI, never container boot:

```powershell
$env:DATABASE_URL_DIRECT = "<session pooler :5432 ...?sslmode=require>"
node packages/shared/migrate-runner.ops.mjs
```

The runner refuses any port other than `5432` and any `sslmode` other than `require`,
asserts that `lock_timeout`/`statement_timeout` actually took effect, and holds a
`pg_try_advisory_lock` for the whole migration — drizzle-orm 0.45.2 has no advisory
lock of its own, and Supavisor silently ignores libpq `options`, so neither guarantee
can be assumed.

Schema rollback — `packages/shared/rollback-0011-0012.ops.sql`:

```powershell
psql "$env:DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f packages/shared/rollback-0011-0012.ops.sql
```

**Bounded window only.** It drops the four `0011`/`0012` tables and deletes their two
journal rows, leaving `0009`/`0010` alone. It refuses to run if any of those tables
holds a single row, because after the application starts writing, dropping them
destroys data. It is therefore valid only between applying the migration and the first
application write.

**After that window the policy is fix-forward.** A failed `migrate` needs no restore —
statements and journal insert share one transaction. A post-commit verification failure
is investigated and fixed forward. Any dump or physical restore requires separate
explicit owner approval with a stated RPO, because restoring discards every write made
since the snapshot.
