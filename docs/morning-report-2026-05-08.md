# NitsyClaw Morning Report - 2026-05-08

## Work completed

- Added no-network tests for the Serper web research adapter.
- Verified search result mapping, result limiting, disabled-search behavior, and status-only provider failure errors.
- Added dashboard expense filter tests for empty filters, invalid dates, and searchable where-clause creation.
- Added feature request capture tests proving WhatsApp/dashboard ideas queue into the backend with hashed requester identity and safe default sizing.
- Improved dashboard voice input error copy so microphone-blocked, no-speech, missing-microphone, network, and aborted cases give different recovery guidance.
- Hardened delete-everything handling so missing auth configuration or missing proof-signing configuration fails closed instead of allowing empty-password reauth or throwing out of the route.
- Restored Serper web-search capability in streaming dashboard chat so `/api/chat/stream` matches normal `/api/chat` search behavior when `SERPER_API_KEY` is configured.
- Made streaming dashboard chat return failing HTTP status codes for pre-stream backend configuration errors instead of a 200 response with an error event.

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
- `pnpm run release:preflight` passed: git/secret checks, lint, workspace typecheck, build, coverage, e2e, and deep security.
- `pnpm run release:live-smoke` passed against `https://nitsyclaw.vercel.app`: health, privacy, terms, login copy, and protected API auth boundaries.
- `pnpm run audit:doctor` failed with 2 local environment blockers: Docker is missing for OWASP ZAP, and Windows symlink privilege is unavailable for local Vercel artifact packaging. Vercel CLI, curl, and live health passed.
- `pnpm exec vitest run apps/dashboard/src/app/api/data/delete/route.test.ts data-controls.test.ts data-export-redaction.test.ts apps/dashboard/src/lib/data-export-proof.test.ts` passed: 4 files, 11 tests.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after the data-delete route hardening.
- `pnpm exec vitest run dashboard-stream-privacy.test.ts packages/shared/test/08-web-research.test.ts apps/dashboard/src/app/api/chat/stream/route.test.ts` passed: 3 files, 9 tests.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after streaming chat search parity.
- `pnpm exec vitest run apps/dashboard/src/app/api/chat/stream/route.test.ts dashboard-stream-privacy.test.ts apps/dashboard/src/lib/chat-validation.test.ts` passed: 3 files, 9 tests.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after streaming chat status hardening.
- `pnpm run operator:next` failed safely because local `DATABASE_URL` is not configured. The runner reported that no queue state was changed.
- `pnpm lint` passed after the latest route hardening cycle.
- `pnpm test` passed after the latest route hardening cycle: 128 test files, 497 tests.
- `pnpm build` passed after the latest route hardening cycle.
- `pnpm run security:deep` passed after the latest route hardening cycle: Semgrep 0 findings plus dependency audit.
- `pnpm test:e2e` passed after the latest route hardening cycle: 12 Playwright tests.

## Guardrails kept

- No deploy.
- No push.
- No database migration.
- No secret changes.
- No WhatsApp/email sends.
- No production data mutation.
