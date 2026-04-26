# Testing — NitsyClaw

Per Constitution **R15**, every P0 feature has unit + integration coverage. CI gates: 70% lines, 65% branches.

## Pyramid

```
                     ▲
                    ╱ ╲
                   ╱   ╲      E2E (Playwright)
                  ╱     ╲     apps/dashboard/test/e2e/dashboard.spec.ts
                 ╱       ╲    7 specs against the dashboard pages
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

## Counts (session 1)

| Layer | Files | Tests |
|---|---|---|
| Unit | 14 | ~70 |
| Integration | 2 | ~10 |
| E2E | 1 | 7 |

## Running

```bash
pnpm test              # all unit + integration
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # generate coverage/ HTML + lcov
pnpm test:e2e          # Playwright (auto-starts dashboard)
pnpm test:e2e --ui     # Playwright UI mode
```

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
