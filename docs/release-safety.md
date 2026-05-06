# Release Safety

NitsyClaw releases must be boring and reversible.

## Rules

- Release preflight scripts may run checks only.
- Release scripts must not run `git reset`, `git clean`, `git checkout`, `git push`, `git remote set-url`, `git add .`, `git add -A`, or `vercel deploy --prod`.
- GitHub authentication must use the normal credential manager or SSH, never a PAT embedded in the remote URL.
- Deploys should come from GitHub/Vercel after a normal push, not from local force scripts.
- Every release must show `git remote`, `git status --short`, `git diff --check`, and `pnpm release:check`.
- Before commit/push, preflight must fail if local secrets, local sessions, `.vercel`, or `.claude/settings.local.json` are staged.
- Before release, preflight must also fail if high-risk local files still exist inside the repo: `.env.local`, Google OAuth files, Microsoft OAuth files, SQLite/DB files, or `.wa-session`.
- Local bot secrets belong in `C:\Users\Nitesh\.nitsyclaw\secrets` by default, or in `NITSYCLAW_SECRET_ROOT` when that environment variable is set.
- After a production deploy, run `pnpm release:live-smoke` before calling the deploy good.
- Emergency rollback scripts may mutate Vercel aliases only after a dry run verifies the target deployment. They must not deploy new code or mutate git.
- Semgrep and `pnpm audit` are part of the default release gate. Snyk is separate because it requires external authentication.

## Local preflight

```powershell
pnpm release:preflight
```

This command verifies the remote, checks staged files, checks repo-local secret/session drift, checks whitespace, runs the full release gate, and prints final status. It does not stage, commit, push, or deploy.

## Security gates

```powershell
pnpm run security:deep
pnpm run security:snyk
pnpm run audit:doctor
```

`security:deep` runs Semgrep with UTF-8 output enabled and then runs `pnpm audit --audit-level=moderate`. `security:snyk` is an extra authenticated scan; if it fails with an auth error, run `snyk auth` or set `SNYK_TOKEN`, then retry.

`audit:doctor` checks the local release machine for Docker/ZAP readiness, Vercel CLI access, Windows symlink privilege, `curl.exe`, and the live health endpoint. It is allowed to fail when the machine is missing Docker or symlink privilege; that is a machine blocker, not a code failure.

## Live smoke

```powershell
pnpm release:live-smoke
```

This checks the live production alias for health, public legal pages, protected API auth gates, no-store headers, and login copy. It does not mutate production.
