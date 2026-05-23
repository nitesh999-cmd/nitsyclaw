# WhatsApp Reliability Audit

Date: 2026-05-23

## Scope

Focused audit of the WhatsApp surface after setting the revenue direction:
- Deterministic reply shape.
- Noisy receipt suppression.
- Feature/status/proof commands.
- Loop breaker behaviour.
- Local router smoke tests.
- Live operator queue access.

No live WhatsApp messages were sent by this audit.
No Railway service was restarted.
No provider OAuth actions were attempted.

## Commands Run

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm run whatsapp:reply-shape` | Passed | 4 test files passed, 25 tests passed, 71 skipped; reply budgets passed |
| `pnpm run whatsapp:smoke` | Passed | 4 test files passed, 132 tests passed |
| `pnpm run operator:doctor` | Passed | `live_queue_access=ready`; `railway_cli_token=not_configured` |
| `pnpm run operator:next` | Passed dry-run | Top live row previewed without mutation |

## Verified Working

- `what can you do` stays under the reply budget and lists ready/setup/safety states.
- `pending build plan` tells the truth: local rails are ready, real external actions need setup.
- `proof test` and `proof details` have deterministic output shapes.
- `Saved. Working on it.` is covered by tests so it should not be sent by the local deterministic path.
- Casual acknowledgements do not trigger the noisy receipt.
- Command jobs can be created without a noisy receipt.
- Loop breaker tests cover echo pause, send burst cooldown, manual reset, and diagnostic state.
- Router smoke tests cover reminders, expenses, feature queue, provider readiness, private mode, send failures, and WhatsApp command shortcuts.

## Current Live Queue Signal

`pnpm run operator:next` dry-run returned:

- Job: `a5a3203d-91b1-4f01-8dda-f72c0d996be2`
- Title: `[Memory] Stale Memory Detector`
- Risk: `feature/P1/M`
- Decision: claim
- Summary: detect stale facts, old locations, past preferences, completed tasks, and outdated snapshots, then ask for review or auto-expire low-risk items.

This is a strong next build because stale memory directly affects trust and daily usefulness.

## Risks Found

### P1 - Railway CLI token is not configured locally

Evidence:
- `operator:doctor` returned `railway_cli_token=not_configured`.

Impact:
- Local queue work can read DB rows, but Railway deploy/log workflows may still need manual login/token setup.

Fix:
- Configure Railway CLI/token only when deploy/log actions are needed.
- Do not block local WhatsApp and product work on this unless deployment is required.

Fixed: No. This needs environment/tooling setup, not code.

### P1 - Provider integrations remain setup-heavy

Evidence:
- `operator:doctor` reports Google/Gmail/Drive/Photos, Microsoft/Outlook/OneDrive, Spotify, Bank feeds, and Phone/SMS need provider setup.
- WhatsApp reply snapshots truthfully show these as `Needs setup`.

Impact:
- We cannot sell full external-account automation yet.

Fix:
- Build provider setup wizard and OAuth flows in priority order.
- Keep WhatsApp replies honest until real connections are verified.

Fixed: No. Requires provider credentials and implementation.

### P2 - WhatsApp remains a platform dependency

Evidence:
- Product relies on WhatsApp Web / WhatsApp runtime health gates.
- Market research shows WhatsApp AI policy risk for general-purpose assistants.

Impact:
- If WhatsApp access changes or session auth breaks, the core surface can degrade.

Fix:
- Keep dashboard as control surface.
- Add alternate channel fallback later: Telegram, SMS, or email intake.

Fixed: No. Strategic product risk.

## Strong Next Fix

Build the stale memory detector next:
- It improves trust.
- It supports the revenue promise.
- It is code-local and does not need OAuth/provider setup.
- It fits the current highest-priority live queue row.

## Release Opinion

WhatsApp local reliability gates passed for deterministic commands and core router paths.

Do not market NitsyClaw as a fully connected personal operator yet.
It is credible as a beta WhatsApp PA for reminders, expenses, bills/docs, drafts, memory, and safe setup-aware planning.
