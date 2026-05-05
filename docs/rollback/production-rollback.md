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

No database schema rollback is required for this release. The shipped changes only add application code, docs, tests, a PowerShell helper, and writes to existing `system_heartbeats`, `feature_requests`, and `audit_log` tables.

If a future release includes a migration, this file must name the exact migration file, backup snapshot, and restore command before deploy.
