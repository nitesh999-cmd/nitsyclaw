# NitsyClaw Morning Report - 2026-05-08

## Work completed

- Added no-network tests for the Serper web research adapter.
- Verified search result mapping, result limiting, disabled-search behavior, and status-only provider failure errors.
- Added dashboard expense filter tests for empty filters, invalid dates, and searchable where-clause creation.
- Added feature request capture tests proving WhatsApp/dashboard ideas queue into the backend with hashed requester identity and safe default sizing.
- Improved dashboard voice input error copy so microphone-blocked, no-speech, missing-microphone, network, and aborted cases give different recovery guidance.

## Verification

- `pnpm exec vitest run packages/shared/test/08-web-research.test.ts` passed: 1 file, 5 tests.
- `pnpm --filter @nitsyclaw/shared typecheck` passed.
- `pnpm exec vitest run apps/dashboard/src/lib/expense-utils.test.ts` passed: 1 file, 5 tests.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed.
- `pnpm exec vitest run packages/shared/test/11-feature-request.test.ts` passed: 1 file, 2 tests.
- `pnpm --filter @nitsyclaw/shared typecheck` passed after feature-capture coverage.
- `pnpm exec vitest run apps/dashboard/src/lib/voice-errors.test.ts dashboard-voice-language.test.ts` passed: 2 files, 3 tests.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after voice input error-copy improvement.
- `pnpm lint` passed after the latest safe-build cycle.
- `pnpm test` passed after the latest safe-build cycle: 127 test files, 493 tests.
- `pnpm build` passed after the latest safe-build cycle.
- `pnpm run security:audit` passed: no known vulnerabilities found.
- `pnpm run security:semgrep` passed: 0 findings across 377 tracked files.
- `pnpm run security:snyk` passed across 4 projects with no vulnerable paths found. Snyk also reported the monthly private-test limit is now reached for the `nitesh999` org.
- `pnpm run security:deep` passed: Semgrep plus dependency audit.
- `pnpm test:e2e` passed: 12 Playwright tests. Local test logs still warn that dashboard auth bypass is active because `NITSYCLAW_DASHBOARD_PASSWORD` is intentionally not set in this local test environment.

## Guardrails kept

- No deploy.
- No push.
- No database migration.
- No secret changes.
- No WhatsApp/email sends.
- No production data mutation.
