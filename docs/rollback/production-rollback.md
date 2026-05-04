# Production rollback

Current production:

- https://nitsyclaw-c056xnn5a-nitesh999-4886s-projects.vercel.app
- Public aliases: https://nitsyclaw.vercel.app and https://nitsyclaw-dashboard.vercel.app
- Commit: `46fc564`

Rollback target:

- https://nitsyclaw-ms1gbfwsv-nitesh999-4886s-projects.vercel.app
- Commit: `f7552c1`

Dry-run rollback check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl "https://nitsyclaw-ms1gbfwsv-nitesh999-4886s-projects.vercel.app"
```

Apply rollback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl "https://nitsyclaw-ms1gbfwsv-nitesh999-4886s-projects.vercel.app" -DryRun:$false
```

This restores both production aliases:

- `nitsyclaw.vercel.app`
- `nitsyclaw-dashboard.vercel.app`

Verify after rollback:

```powershell
npx vercel inspect https://nitsyclaw-ms1gbfwsv-nitesh999-4886s-projects.vercel.app --wait --cwd "C:\Users\Nitesh\projects\NitsyClaw"
curl.exe -I https://nitsyclaw.vercel.app/health
```

Expected `/health` result without a session is `307` to `/login?next=%2Fhealth` with `Cache-Control: no-store`.

Database rollback:

No database schema rollback is required for this release. The shipped changes only add application code, docs, tests, a PowerShell helper, and writes to existing `system_heartbeats`, `feature_requests`, and `audit_log` tables.

If a future release includes a migration, this file must name the exact migration file, backup snapshot, and restore command before deploy.
