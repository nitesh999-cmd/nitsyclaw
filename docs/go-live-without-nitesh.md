# Go-live work that does not need Nitesh

This is the safe work an operator can do while Nitesh is away from the desk.

## Safe to do autonomously

- Run `pnpm run release:preflight`.
- Run `pnpm run security:snyk`.
- Run `pnpm run release:live-smoke`.
- Run `pnpm run audit:doctor` and record machine blockers.
- Fix local code issues found by lint, typecheck, tests, build, Semgrep, audit, or live smoke.
- Add or update tests for any safety fix.
- Update audit, release, and feature-batch docs.
- Improve dashboard copy, mobile readability, and empty states without changing data contracts.
- Improve bot reliability guards: loop breaker, presence unavailable, health heartbeat, and safe error reporting.

## Do not do without Nitesh

- Deploy to production.
- Push to GitHub.
- Rotate production secrets.
- Delete production data.
- Connect new third-party accounts.
- Send outbound WhatsApp, email, SMS, or calendar actions to real people.
- Change billing, payment, or public launch copy that makes legal/commercial claims.

## Current go-live blockers

- Docker is not installed/running locally, so OWASP ZAP baseline is not verified on this machine.
- Windows symlink privilege is unavailable, so local Vercel prebuilt packaging is blocked on this machine.
- The repo has a large uncommitted working tree. Review and commit in clean chunks before deployment.
- Public multi-user sale still needs account separation, onboarding, billing, support, and legal/privacy controls.

## Current safest next command set

```powershell
pnpm run release:preflight
pnpm run security:snyk
pnpm run release:live-smoke
pnpm run audit:doctor
```

