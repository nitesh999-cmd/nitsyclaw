# Release Safety

NitsyClaw releases must be boring and reversible.

## Rules

- Release preflight scripts may run checks only.
- Release scripts must not run `git reset`, `git clean`, `git checkout`, `git push`, `git remote set-url`, `git add .`, `git add -A`, or `vercel deploy --prod`.
- GitHub authentication must use the normal credential manager or SSH, never a PAT embedded in the remote URL.
- Deploys should come from GitHub/Vercel after a normal push, not from local force scripts.
- Every release must show `git remote`, `git status --short`, `git diff --check`, and `pnpm release:check`.
- Before commit/push, preflight must fail if local secrets, local sessions, `.vercel`, or `.claude/settings.local.json` are staged.
- After a production deploy, run `pnpm release:live-smoke` before calling the deploy good.
- Emergency rollback scripts may mutate Vercel aliases only after a dry run verifies the target deployment. They must not deploy new code or mutate git.

## Local preflight

```powershell
pnpm release:preflight
```

This command verifies the remote, checks whitespace, runs the full release gate, and prints final status. It does not stage, commit, push, or deploy.

## Live smoke

```powershell
pnpm release:live-smoke
```

This checks the live production alias for health, public legal pages, protected API auth gates, no-store headers, and login copy. It does not mutate production.
