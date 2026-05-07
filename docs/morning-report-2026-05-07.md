# Morning report - 2026-05-07

## Summary

NitsyClaw moved forward through safe, reversible local work only. No deploy, push, secret change, production data change, outbound message, call, email, purchase, or destructive operation was performed.

Current branch status after this work: `main` is 36 commits ahead of `origin/main`.

## What was inspected

- Project map, architecture docs, package scripts, env example, deployment docs, release safety docs, and test layout.
- Dashboard chat routes, streaming route, auth tests, generated Next route typing behavior, and e2e dashboard route coverage.
- WhatsApp router, WhatsApp session path handling, loop-breaker tests, owner guard, send failure tests, and command job creation flow.
- Shared command job persistence, intent classification, migration files, Drizzle journal, dependency lock, and release scripts.
- Local release machine readiness through `audit:doctor`.
- Continued audit cycles for WhatsApp runtime status, session storage docs, debug diagnostics, Snyk scan scope, operator roadmap queuing, dashboard readability, and command-job idempotency.
- Continued audit cycles for dashboard fallback speed, login return paths, agent tool-output size, and risky-action approval wording.
- Continued audit cycles for hosted server log privacy and client error boundary logging.

## What changed

- Command job user-facing errors now use audit redaction before persistence.
- WhatsApp duplicate inbound message IDs are deduped before command job creation.
- Command job `dedupe_key` now has a registered unique migration.
- Dashboard streaming no longer sends raw tool inputs to the browser.
- Risky commands that start with `yes` are still gated when they include action words.
- Weather requests route as actionable PA commands.
- Feature-capture commands remain actionable even when they mention future risky actions.
- The vulnerable `basic-ftp@5.3.0` transitive dependency is overridden to `5.3.1`.
- The release preflight secret scan now prunes generated folders before recursion.
- README now points to the launch, env, testing, QA, and safety docs.
- Launch ops docs were added for architecture, env, and manual QA.
- WhatsApp runtime status reasons are redacted before heartbeat/audit metadata is emitted.
- WhatsApp session storage docs now match the runtime secret-root behavior.
- The local debug page no longer exposes environment variable shape.
- Snyk scans are scoped to real workspace manifests instead of generated `.next` manifests.
- Individual Next 50 roadmap items can now be queued from `/command`.
- Dashboard shell, login, command, help, privacy, terms, and loading surfaces use darker readable contrast.
- Duplicate command-job dedupe keys now return the existing job instead of creating duplicate work.
- Today and Command pages now fall back faster when storage is slow, reducing post-login buffering.
- Login redirects now preserve the original page query string, so filtered views survive authentication.
- Agent tool-result text is capped before being fed back to the model to reduce runaway token/cost risk.
- Booking, appointment, schedule, and order wording is now approval-gated.
- Dashboard chat, stream, health, data, and Spotify integration server errors now log redacted structured details instead of raw error objects.
- The client error boundary logs only error name and digest instead of the raw browser error object.

## Commits made

- `fb38176 feat: add durable command job spine`
- `9821e23 feat: clarify unclear PA commands`
- `96de64b feat: add voice language control`
- `b788c50 docs: add PA V1 launch checklist`
- `a59a848 fix: redact command job errors`
- `9beac8d feat: wire Serper web search, PM2 config, rate limiting complete`
- `d1ad5cb fix: dedupe whatsapp command jobs`
- `ef7bfaa fix: hide stream tool inputs`
- `da6bfe7 fix: keep risky yes commands gated`
- `6f5be95 fix: route weather requests as actionable`
- `ef104c5 docs: add launch ops guides`
- `aa7abfc fix: keep feature capture actionable`
- `dffa455 fix: register command dedupe migration`
- `5752681 chore: remove stale chat route type import`
- `b693c0c fix: override vulnerable basic-ftp`
- `c36154a fix: speed up preflight secret scan`
- `e59a829 docs: surface launch operations guides`
- `1e4d9c3 fix: redact whatsapp runtime reasons`
- `3d674bd docs: align whatsapp session storage setup`
- `b828b1f fix: reduce debug page environment exposure`
- `9b58869 fix: limit snyk scan to workspace manifests`
- `085c748 feat: queue individual next 50 moves`
- `72cb0ad style: improve dashboard contrast`
- `8bab960 style: improve readable dark dashboard surfaces`
- `4d3e991 fix: make command job dedupe idempotent`
- `aa3976f fix: shorten dashboard fallback waits`
- `9260851 fix: preserve login return query`
- `ec84f21 fix: cap agent tool result context`
- `03eecce fix: gate booking and order wording`
- `2764612 fix: redact dashboard error logs`
- `3c5e1e1 fix: use redacted server error logs`
- `eb0c59e fix: avoid raw client error logging`
- Audit payloads now cap very wide nested objects before DB writes, reducing privacy and storage blast radius from unexpected tool/API responses.
- Bot router failure logs now go through a redacted formatter, log context is sanitized before console output, and shared token redaction now catches Stripe-style `sk_live`/`sk_test` tokens before phone-number redaction.
- Dashboard login attempt-storage failures now log through the redacted dashboard runtime logger instead of printing raw error objects.
- Data export/delete API failure copy now gives normal user recovery wording instead of telling people to check server logs.
- Health and Spotify integration failure copy now also avoids server-log wording and gives normal retry guidance.
- Stats API/page failures now use redacted logging and generic user-facing messages; `/api/stats` also explicitly disables caching.
- Search API/page failures now use redacted logging and generic user-facing messages; search terms are capped before database queries.
- Expense CSV export failures now use redacted logging and generic user-facing messages; validation errors also return no-store.
- Main dashboard pages now use redacted load logging and normal retry guidance instead of telling users to check another page.
- Chat UI now avoids rendering raw browser/fetch exception messages when stream or fallback calls fail.
- Reminder creation with an invalid date now shows a visible error instead of silently doing nothing.

## Verification run

Passed:

- `pnpm lint`
- `pnpm -r typecheck`
- `pnpm test` - 113 files, 446 tests
- `pnpm build`
- `pnpm test:coverage` - 113 files, 447 tests
- `pnpm test:e2e` - 12 Playwright tests
- `pnpm run security:audit` - no known vulnerabilities
- `pnpm run security:deep` - Semgrep passed, 0 findings, audit passed
- `pnpm run security:snyk` - no vulnerable paths found
- `pnpm run release:preflight` - passed after preflight scan fix
- Focused WhatsApp runtime/session tests passed after runtime redaction and session doc alignment.
- Focused dashboard debug/auth/command/readability tests passed after debug and UI changes.
- Focused command-job, operator jobs, bot router, and command shortcut tests passed after dedupe/idempotency changes.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after dashboard changes.
- `pnpm --filter @nitsyclaw/shared typecheck` passed after command-job changes.
- Latest full gate passed: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 113 files, 453 tests, and `pnpm build`.
- Latest full gate passed again after log hardening: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 114 files, 455 tests, and `pnpm build`.
- Focused audit sanitizer regression passed after adding the wide-object cap.
- `pnpm --filter @nitsyclaw/shared typecheck` passed after audit sanitizer changes.
- Focused bot safe-log, router integration, and audit sanitizer regressions passed after bot log redaction and context sanitization.
- `pnpm --filter @nitsyclaw/bot typecheck` and `pnpm --filter @nitsyclaw/shared typecheck` passed after bot log redaction.
- Focused login route timeout/failure tests and dashboard runtime tests passed after login log redaction.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after login log redaction.
- Latest full gate passed after the new privacy/login commits: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 116 files, 459 tests, and `pnpm build`.
- Focused data control, export proof, and export redaction tests passed after data-control copy cleanup.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after data-control copy cleanup.
- Focused safe-error, health page, provider revocation, and integrations page tests passed after removing remaining server-log wording.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after health/Spotify copy cleanup.
- Focused private API cache and safe-error tests passed after stats API/page hardening.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after stats hardening.
- Focused search safety, private API cache, and safe-error tests passed after search hardening.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after search hardening.
- Focused safe-error, private API cache, and expense-utils tests passed after expense export hardening.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after expense export hardening.
- Latest full gate passed after search/expense hardening: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 117 files, 461 tests, and `pnpm build`.
- Focused safe-error, health page, and readability tests passed after dashboard page failure-copy cleanup.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after dashboard page failure-copy cleanup.
- Focused chat client error, safe-error, and quick-action tests passed after chat client failure-copy cleanup.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after chat client failure-copy cleanup.
- Latest full gate passed after dashboard/chat error-copy hardening: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 118 files, 463 tests, and `pnpm build`.
- `pnpm run security:audit` passed again with no known vulnerabilities.
- Focused reminders page and safe-error tests passed after invalid-date feedback was covered.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after reminder feedback coverage.
- Focused safe-error, private-cache, auth-route, and operator-job tests passed after replacing remaining dashboard API raw error logs with redacted logging.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after dashboard API log cleanup.
- Focused chat client error and safe-error tests passed after removing raw chat client exception logging.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after chat client log cleanup.
- Focused bot safe-error tests passed after email/calendar adapters were moved to redacted bot logging.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after adapter log cleanup.
- Focused bot safe-error and notify reliability tests passed after Microsoft Graph and email notification errors stopped including raw provider response bodies/log objects.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after Microsoft Graph log cleanup.
- Focused bot safe-error and watchdog tests passed after scheduler logs and heartbeat error metadata were sanitized.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after scheduler log cleanup.
- Focused bot safe-error and external env loader tests passed after Microsoft auth stopped printing raw OAuth response bodies.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after Microsoft auth output cleanup.
- Focused bot safe-error and operator-runner tests passed after build-agent WhatsApp notification failures were moved to redacted logging.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after build-agent log cleanup.
- Focused bot safe-error and location env tests passed after bot boot/shutdown failure logs were moved to redacted logging.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after bot boot log cleanup.
- Focused WhatsApp client regression, bot safe-error, and location env tests passed after WhatsApp restart/status reasons were sanitized.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after WhatsApp client log cleanup.
- Latest full gate passed after the bot/dashboard log privacy sweep: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 119 files, 470 tests, and `pnpm build`.
- `pnpm run security:audit` passed with no known vulnerabilities.
- `pnpm run security:deep` passed: Semgrep scanned 367 tracked files with 0 findings and the dependency audit still reported no known vulnerabilities.
- Focused safe-error, confirmations, queue-control, and private-cache tests passed after `/confirmations` and `/queue` stopped converting raw load exceptions into page copy.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after confirmations/queue page hardening.
- Focused stream privacy, stream route, and safe-error tests passed after dashboard streaming chat stopped feeding raw tool validation/unknown-tool errors back into the LLM-visible transcript.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after streaming tool-error privacy hardening.
- Focused bot safe-error, router integration, and send-failure tests passed after the remaining router outbound-persist raw error log moved to redacted logging.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after router log cleanup.
- Focused bot safe-error, WhatsApp presence, send-failure, and WhatsApp client regression tests passed after presence/send-monitor failures were sanitized in logs, heartbeat metadata, and urgent notifications.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after presence/send monitor log cleanup.
- Focused command page, operator missions, and chat client error tests passed after `/command` stopped displaying raw client exception text.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after command client failure-copy cleanup.
- Focused bot safe-error, external env, and bot secret-path tests passed after Google OAuth CLI failures stopped printing raw OAuth error objects.
- `pnpm --filter @nitsyclaw/bot typecheck` passed after Google auth output cleanup.
- Focused stream privacy, stream route, safe-error, and audit sanitizer tests passed after streaming tool failure errors were redacted before audit logging.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after stream audit-error cleanup.
- Latest full gate passed after the command/stream/privacy follow-up: `pnpm lint`, `pnpm -r typecheck`, `pnpm test` - 119 files, 473 tests, and `pnpm build`.
- `pnpm run release:preflight` passed. It ran lint, typecheck, build, coverage, 12 Playwright E2E tests, and `security:deep`. The temporary Next `next-env.d.ts` dev import was restored clean by rerunning dashboard typecheck.
- `scripts/preflight.ps1` now restores the generated `apps/dashboard/next-env.d.ts` route import automatically after `pnpm release:check`, without using Git checkout/reset.
- Focused package-script regression tests passed for the preflight route-import restore policy.
- `pnpm --filter @nitsyclaw/dashboard typecheck` passed after the preflight script change.
- `pnpm run release:preflight` passed again after the script change. It ran lint, typecheck, build, coverage, 12 Playwright E2E tests, and `security:deep`, then left only the intended source edits dirty.
- `pnpm run release:vercel-build` could not complete local artifact packaging because Windows symlink privilege is unavailable. The dashboard Next build inside that gate passed; remaining blocker is local Windows Developer Mode/elevated PowerShell or running Vercel build in CI/Linux.
- `pnpm run release:live-smoke` passed against `https://nitsyclaw.vercel.app` using non-mutating GET/HEAD checks: healthz 200, privacy/terms 200, protected APIs 401, login 200 with expected copy.
- `pnpm run operator:next` still fails safely because `DATABASE_URL` is not configured locally. It confirmed no queue state was changed.
- `pnpm run audit:doctor` still reports 2 local environment blockers: Docker is missing for ZAP, and Windows symlink privilege is unavailable for local Vercel artifact packaging. It confirmed Vercel CLI, `curl.exe`, and live `/api/healthz` are OK.

Failed or blocked:

- `pnpm run audit:doctor` failed because Docker is missing and Windows symlink privilege is unavailable. It did confirm Vercel CLI exists, `curl.exe` exists, and live `/api/healthz` is reachable.
- `pnpm run operator:next` failed safely because `DATABASE_URL` is not configured. It reported that no queue state was changed.
- `pnpm db:migrate` was not run because this can change database state and the current instruction forbids production data changes without a clear decision.

## Still broken or not ready

- DB migration for `command_jobs` dedupe must be applied before deploying this code.
- Local machine cannot complete ZAP/Vercel packaging readiness until Docker is installed/started and Windows symlink privilege is enabled or the packaging check runs in CI/Linux.
- Operator queue cannot be inspected locally until `DATABASE_URL` is configured outside the repo.
- Public sale readiness is still not there. Personal-use V1 is much closer, but multi-user tenancy, billing, explicit consent, tenant isolation, and production-grade voice are still not complete.

## Skipped on purpose

- No deploy or push.
- No secret edits.
- No production database migration.
- No WhatsApp message sending.
- No email sending.
- No live destructive API checks.

## Needs Nitesh decision

- Provide or confirm safe local DB env path for `DATABASE_URL` and `DATABASE_URL_DIRECT`.
- Approve when to run `pnpm db:migrate`.
- Decide whether Docker/ZAP should be installed locally or shifted to CI.
- Approve push/deploy once migration and live smoke plan are clear.

## Top 10 next actions

1. Configure local DB env outside the repo.
2. Run `pnpm db:migrate` against the intended database.
3. Run `pnpm run release:preflight` again after migration.
4. Run `pnpm run operator:next` and review queued work dry-run.
5. Run live smoke against the target deployment without mutating data.
6. Enable Docker or CI ZAP baseline for web security coverage.
7. Fix local Vercel symlink packaging by enabling Windows Developer Mode or using CI/Linux.
8. Add a real WhatsApp receive/send staging smoke with a non-production test account.
9. Add dashboard mobile visual regression screenshots for `/`, `/chat`, `/command`, `/queue`, and `/settings`.
10. Prepare a reversible deploy plan with exact rollback command before any deploy.

## Go-live view

Personal-use V1: moving in the right direction, but not ready to deploy until migration and live smoke are done.

Commercial/public sale: not ready. The base is improving, but tenant isolation, billing, onboarding, consent, support, legal, and production voice reliability still need work.
