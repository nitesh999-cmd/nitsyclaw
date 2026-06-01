# Testing — NitsyClaw

Per Constitution **R15**, every P0 feature has unit + integration coverage. CI gates: 70% lines, 65% branches.

Current verified gate from the latest local check:

- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- Playwright E2E dashboard specs pass.
- Semgrep: 0 findings.
- `pnpm audit --audit-level=moderate`: no known vulnerabilities.

## Pyramid

```
                     ▲
                    ╱ ╲
                   ╱   ╲      E2E (Playwright)
                  ╱     ╲     apps/dashboard/test/e2e/dashboard.spec.ts
                 ╱       ╲    12 specs against the dashboard pages
                ╱─────────╲
               ╱           ╲
              ╱             ╲ Integration (Vitest)
             ╱               ╲ apps/bot/test/router.integration.test.ts
            ╱                 ╲ packages/shared/test/agent-loop.test.ts
           ╱───────────────────╲
          ╱                     ╲
         ╱                       ╲ Unit (Vitest)
        ╱                         ╲ packages/shared/test/*.test.ts
       ╱                           ╲ One file per feature + utils + crypto + env
      ╱_____________________________╲
```

## Current counts

Do not hard-code current test counts in this doc. Vitest and Playwright print the exact file/spec counts during each run, and those numbers drift whenever coverage improves.

## Running

```bash
pnpm test              # all unit + integration
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # generate coverage/ HTML + lcov
pnpm test:e2e          # Playwright (auto-starts dashboard)
pnpm test:e2e --ui     # Playwright UI mode
pnpm release:live-smoke # smoke-test production after deploy
pnpm run audit:doctor   # check local Docker, Vercel CLI, symlink, and live health blockers
pnpm operator:doctor    # check whether this terminal can safely read the live feature queue
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/release-secrets-doctor.ps1 # check GitHub CI release secrets without printing values
```

`pnpm release:preflight` also blocks local secret drift before release. It fails if OAuth tokens, `.env.local`, SQLite/DB files, or WhatsApp session folders are left inside the repo instead of the external secret root.

`pnpm run audit:doctor` is intentionally stricter about machine readiness. It fails if Docker is missing or Windows symlink privilege blocks local Vercel prebuilt packaging.

`pnpm operator:doctor` is read-only. It reports whether `DATABASE_URL` is present for live queue reads and whether provider setup signals exist, without printing secrets.

`scripts/release-secrets-doctor.ps1` is read-only. It checks whether GitHub Actions has `RAILWAY_TOKEN` for live WhatsApp/Railway proof and whether Vercel packaging secrets are present. It never prints secret values. Keep this passing before worker/Railway changes.

## Production smoke

After any production deploy, run:

```powershell
pnpm release:live-smoke
```

This checks:

- `/api/healthz` returns `200`, `ok=true`, and `Cache-Control: no-store`
- `/privacy` and `/terms` are public and no-store
- `/api/sale-readiness` and `/api/chat/history` reject unauthenticated access with `401`
- `/login` contains `Personal life admin`
- `/login` does not contain the old `Personal AI control plane` copy

## Tagged tests

- `@live` — require real WhatsApp/Anthropic/OpenAI keys. Skipped in CI by name filter.
- Run live tests locally: `pnpm test --reporter=verbose -t "@live"`.

## Test data

Every test gets a fresh in-memory fake DB via `makeFakeDb()` in `packages/shared/test/helpers.ts`. No shared state. No real Postgres needed for unit tests.

For Drizzle queries that need real SQL, install `pg-mem` and add a setup helper. v1 doesn't need it — fake DB covers feature flow assertions.

## What we test by feature

| Feature | Unit | Integration | E2E |
|---|---|---|---|
| 1. Text command | classify, reply tool | router → reply | — |
| 2. Voice capture | transcribe, store, error paths | router → transcribe → ack | — |
| 3. Reminders | parse, plan, fire-due | — | — |
| 4. Morning brief | build, send | — | Today page |
| 5. What's on my plate | summarize empty | — | Today page |
| 6. Memory recall | pin, recall round trip | — | Memory page |
| 7. Schedule call | tool, validation, errors | — | — |
| 8. Web research | summarize, empty results | — | — |
| 9. Confirmation rail | yes/no/expired/null | router (no pending) | — |
| 10. Receipt expense | categorize, OCR, parse | router → image → log | Expenses page |

Plus generic infrastructure: agent loop (4 tests), tool registry (5), env validation (3), crypto (5), WhatsApp mock (4).
