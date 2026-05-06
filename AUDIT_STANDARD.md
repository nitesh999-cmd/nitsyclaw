# NitsyClaw Audit Standard

This is the mandatory audit standard for NitsyClaw before any serious release,
production deploy, or launch-readiness claim.

The goal is not "it works". The goal is: hard to break, safe with personal data,
clear for normal people, rollback-ready, and verified with evidence.

## Non-Negotiables

- Do not guess. Verify from code, config, commands, logs, or observed behaviour.
- Do not ignore failed commands. Diagnose the failure or mark it unresolved.
- Do not use fake fixes, placeholders, TODOs, or assumed pass results.
- Do not make cosmetic changes unless they improve trust, clarity, conversion,
  accessibility, reliability, or safety.
- Anything not verified must be labelled `UNVERIFIED`.
- P0 and P1 issues must be fixed before a ship recommendation, unless explicitly
  escalated with evidence.
- Every final report must include commands run, pass/fail results, changed files,
  remaining risks, and a clear ship decision.

## Phase 1 - Product Map

Before changing code, identify:

- What the product does in plain English.
- Who the user is.
- Main journeys:
  - login
  - dashboard chat
  - WhatsApp bot
  - memory/reminder/expense capture
  - operator queue
  - data export/delete
  - integrations
- Business goal.
- Highest-risk flows.
- External services and APIs.
- Data collected or processed.
- Security, privacy, legal, and trust exposure.
- Vercel deployment shape and rollback path.

## Phase 2 - Codebase Audit

Inspect:

- `apps/dashboard`
- `apps/bot`
- `packages/shared`
- API routes
- middleware/auth/session logic
- mutating routes and CSRF protections
- data export/delete flows
- encryption and redaction paths
- audit logging
- integration clients
- environment variable loading
- queue/operator logic
- tests
- `package.json`
- `playwright.config.ts`
- `apps/dashboard/vercel.json`
- deployment scripts under `scripts`
- root safety docs and constitution files

Look for:

- broken flows
- type/runtime errors
- weak validation
- raw error leaks
- private data leaks
- missing same-origin checks
- missing auth gates
- missing rate limits
- prompt/tool injection risks
- secrets in logs, docs, fixtures, or local files
- duplicate submissions/race conditions
- bad mobile behaviour
- accessibility issues
- misleading user-facing copy
- Vercel runtime incompatibilities
- rollback gaps

## Phase 3 - Adversarial Tests

Try to break the app with:

- empty inputs
- very long inputs
- malformed JSON
- strange characters and emojis
- script injection payloads
- direct API calls bypassing frontend validation
- cross-origin mutating requests
- missing cookies/session
- expired or tampered sessions
- missing environment variables
- API timeout/500/401/403/429 assumptions
- repeated submissions and double clicks
- mobile viewport checks
- local auth bypass conditions
- export/delete attempts without proof or re-auth
- WhatsApp messages that may loop, spam, or expose private data

## Phase 4 - Mandatory Verification Commands

Run the repo's real commands. Prefer `pnpm` because this project declares
`packageManager: pnpm@10.33.2`.

Minimum local gate:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm --filter @nitsyclaw/dashboard build
pnpm run security:audit
pnpm run security:deep
```

Release gate:

```powershell
pnpm run release:preflight
pnpm run release:vercel-build
```

If deploying or checking production:

```powershell
pnpm run release:live-smoke
```

Optional, when tools are available and credentials are configured:

```powershell
pnpm run security:semgrep
pnpm run security:snyk
vercel build
```

If a command is missing, report it as a tooling gap.
If a command fails, include the exact failing command and the root cause.

## Phase 5 - Risk Register

Rank every issue:

### P0 Critical

App cannot build, deploy is blocked, core auth/session is broken, private data can
leak, data can be lost, WhatsApp can loop/spam, destructive action is unsafe, or a
core product promise is false.

### P1 High

Major UX failure, mobile failure, weak validation, unreliable API handling, raw
error exposure, missing important tests, missing same-origin checks, flaky core
flow, or Vercel runtime risk.

### P2 Medium

Edge-case bug, maintainability issue, observability gap, confusing UX, performance
concern, incomplete copy/legal clarity, or non-core integration weakness.

### P3 Low

Small cleanup only. Fix if low-risk and already nearby.

For every issue, include:

- severity
- file/location
- evidence
- impact
- root cause
- fix
- fixed yes/no
- verification

## Phase 6 - Fixing Rules

Fix order:

1. P0 Critical
2. P1 High
3. Safe quick P2 only
4. P3 only if trivial and directly related

Implementation rules:

- Keep changes targeted and reversible.
- Preserve existing product flows.
- Add tests for high-risk behaviour.
- Fail closed on auth, privacy, encryption, and destructive actions.
- Use clear user-safe errors instead of raw stack traces.
- Do not weaken security to make tests pass.
- Do not deploy without a rollback path.

## Phase 7 - Final Gate

Before saying the audit is complete, prove:

- build status
- lint status
- typecheck status
- unit/integration test status
- E2E status
- security audit status
- Vercel build status when relevant
- critical flows checked
- remaining P0/P1 count
- exact unresolved risks

## Final Report Template

Use this structure:

1. Release readiness score out of 10
2. Ship decision:
   - `SAFE TO SHIP`
   - `SHIP WITH RISKS`
   - `DO NOT SHIP`
3. Product understanding
4. Critical flows checked
5. Issues found by severity
6. Security risks found
7. Vercel/deployment risks found
8. Fixes completed
9. Files changed
10. Commands run
11. Pass/fail results
12. Remaining risks
13. Unverified items
14. Top 5 next actions

## Ship Decision Rules

- `SAFE TO SHIP`: all required gates pass, no unresolved P0/P1, rollback path is
  known, production env assumptions are verified.
- `SHIP WITH RISKS`: no unresolved P0, P1s are fixed or explicitly accepted, and
  remaining risks are operational/product risks with clear owner action.
- `DO NOT SHIP`: any unresolved P0, failed build, failed auth/privacy gate,
  unsafe destructive action, unverified production env, or broken core flow.
