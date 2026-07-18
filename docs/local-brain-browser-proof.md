# Local Brain Browser Proof

Date: 2026-07-18

Branch: `feat/local-brain-browser-proof`

Purpose: prove the `/local-brain` dashboard path with synthetic owner data, real local Ollama inference, and no real database or outbound action path.

## Fixture architecture

- Entry command: `pnpm run local-brain:browser-proof`
- Runner: `scripts/local-brain-browser-proof.ts`
- UI fixture: `apps/dashboard/src/app/local-brain/browser-proof-fixture.ts`
- Page wiring: `apps/dashboard/src/app/local-brain/page.tsx`
- Artifact directory: `output/playwright/local-brain-browser-proof/`

The runner starts the dashboard on a random loopback port with:

- `NITSYCLAW_LOCAL_BRAIN_BROWSER_PROOF=1`
- `NITSYCLAW_SYNTHETIC_DB_FIXTURE=local-brain-browser-proof`
- `NITSYCLAW_MODEL_MODE=local_only`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `WHATSAPP_OWNER_NUMBER=+61000000000`
- dashboard dev auth bypass enabled

The proof fixture renders only when the exact fixture flag is present.

## Safety boundaries

The fixture fails closed when:

- `DATABASE_URL` or `DATABASE_URL_DIRECT` is present
- `NODE_ENV=production`
- Vercel or Railway environment markers are present
- model mode is not `local_only`
- Ollama is not loopback
- provider/send/analytics env such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, Google/Microsoft/Spotify secrets, `NTFY_TOPIC`, or PostHog key is present

The runner clears provider/send/analytics env for the child dashboard process. Browser-side requests are blocked unless the target host is loopback.

No WhatsApp messages, email, calendar action, cloud model call, analytics call, real DB read/write, schema migration, account change, push, or deploy is part of this proof.

## Synthetic scenarios proved

`pnpm run local-brain:browser-proof` passed on 2026-07-18.

Evidence:

- JSON: `output/playwright/local-brain-browser-proof/2026-07-18T07-01-13-528Z/evidence.json`
- Screenshot: `output/playwright/local-brain-browser-proof/2026-07-18T07-01-13-528Z/local-brain-browser-proof.png`

Browser checks:

- fixture: `local-brain-browser-proof`
- grounded Today focus: `Finish the synthetic Local Brain browser proof`
- owner preference recall: `Browser proof drink preference is peppermint tea.`
- old corrected memory excluded
- other owner's memory excluded
- prompt-injection memory excluded
- risky action status: `awaiting_approval`
- outbound action calls: `0`
- real Qwen response route: `local / local_only / 52 chars`

The browser proof also scans the rendered body for forbidden synthetic leak strings:

- other-owner private memory text
- prompt-injection text
- credential-extraction wording
- old corrected preference text

## Verification commands

Passing commands from this phase:

```powershell
pnpm exec vitest run apps/dashboard/src/app/local-brain/page.test.ts apps/dashboard/src/app/local-brain/browser-proof-fixture.test.ts package-scripts.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
$env:NITSYCLAW_MODEL_MODE='local_only'; $env:OLLAMA_BASE_URL='http://127.0.0.1:11434'; $env:OLLAMA_CHAT_MODEL='qwen3:8b'; $env:OLLAMA_EMBEDDING_MODEL='nomic-embed-text:latest'; $env:OLLAMA_CONTEXT_LIMIT='4096'; $env:OLLAMA_THINK='false'; pnpm run local-brain:release-gate
$env:NITSYCLAW_MODEL_MODE='local_only'; $env:OLLAMA_BASE_URL='http://127.0.0.1:11434'; $env:OLLAMA_CHAT_MODEL='qwen3:8b'; $env:OLLAMA_EMBEDDING_MODEL='nomic-embed-text:latest'; $env:OLLAMA_CONTEXT_LIMIT='4096'; $env:OLLAMA_THINK='false'; pnpm run local-brain:controlled-demo
pnpm run local-brain:browser-proof
pnpm run whatsapp:release-gate
```

Observed results:

- focused tests: 3 files, 39 tests passed
- typecheck: shared, bot, dashboard passed
- lint: passed with 0 errors and 6 pre-existing warnings
- full tests: 208 files, 1,068 tests passed
- build: bot and dashboard passed
- Local Brain release gate: passed with `local_only`, Ollama 0.32.1, `qwen3:8b`, `nomic-embed-text:latest`, policy 36/36, retrieval 25/25, privacy/injection/stale-memory failures 0
- controlled demo: passed; real local Qwen response, `local_only`, 591.9 ms, 67 response characters
- browser proof: passed; real local Qwen route, 52 response characters
- WhatsApp release gate: passed in dry scope; no Railway mutation, no WhatsApp sends, no provider OAuth actions

One initial `pnpm run local-brain:release-gate` attempt failed because `NITSYCLAW_MODEL_MODE` was not set in that shell. It was rerun successfully with explicit in-process local-only environment variables.

## Remaining limitations

- This proves the browser path against a disposable synthetic fixture, not real personal data.
- Public sale remains blocked by existing multi-user auth and tenant-isolation review gaps.
- Owner-only demo still requires local Ollama running with `qwen3:8b` and `nomic-embed-text:latest`.
- This branch was not pushed or deployed.

## Main integration proof -- 2026-07-18

Branch: `integrate/local-brain-main`

Canonical local main: `2038900` (`feat(bot): WhatsApp @lid self-chat calibration, send-ack error handling, calendar heads-up notify`)

Integration method: clean cherry-pick onto a separate worktree at `C:\Users\Nitesh\projects\NitsyClaw-integrate-local-brain`. Existing completed branches and their untracked files were left untouched.

Original Local Brain commits integrated:

- `76a0a26` -> `d802fc6`
- `1bc6ec7` -> `702f749`
- `9f4a8ef` -> `fa5cf7a`
- `dca9ef8` -> `c41eafe`
- `69935ff` -> `1a5ca7c`
- `5774ddc` -> `2181eba`

Conflicts: none.

Safety preservation checks:

- `/local-brain` still calls `assertPublicSaleTenantBoundaries()`.
- `/local-brain` reads `memories`, `confirmations`, and audit rows through the current owner hash.
- The synthetic browser fixture still fails closed when real database URLs, production/Railway/Vercel env markers, non-loopback Ollama, non-`local_only` mode, or external provider keys are present.
- `whatsapp:release-gate` remained dry: no Railway mutation, no WhatsApp sends, and no provider OAuth actions.
- `tenant:check` still reports `safe_for_public_sale=no`, preserving the public-sale block.

Post-integration verification:

```powershell
pnpm install --offline --frozen-lockfile
pnpm exec vitest run packages/shared/test/local-brain.test.ts apps/dashboard/src/app/local-brain/page.test.ts apps/dashboard/src/app/local-brain/browser-proof-fixture.test.ts apps/dashboard/src/app/chat/page.test.ts packages/shared/src/db/repo-tenant-guard.test.ts packages/shared/test/tenant-boundaries.test.ts apps/bot/test/router.integration.test.ts apps/bot/src/whatsapp-loop-breaker.test.ts package-scripts.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
$env:NITSYCLAW_MODEL_MODE='local_only'; $env:OLLAMA_BASE_URL='http://127.0.0.1:11434'; $env:OLLAMA_CHAT_MODEL='qwen3:8b'; $env:OLLAMA_EMBEDDING_MODEL='nomic-embed-text:latest'; $env:OLLAMA_CONTEXT_LIMIT='4096'; $env:OLLAMA_THINK='false'; pnpm run local-brain:release-gate
$env:NITSYCLAW_MODEL_MODE='local_only'; $env:OLLAMA_BASE_URL='http://127.0.0.1:11434'; $env:OLLAMA_CHAT_MODEL='qwen3:8b'; $env:OLLAMA_EMBEDDING_MODEL='nomic-embed-text:latest'; $env:OLLAMA_CONTEXT_LIMIT='4096'; $env:OLLAMA_THINK='false'; pnpm run local-brain:controlled-demo
pnpm run local-brain:browser-proof
pnpm run whatsapp:release-gate
```

Observed results:

- Offline dependency link: passed; lockfile unchanged, downloaded `0`.
- Focused affected tests: 9 files, 247 tests passed.
- Typecheck: passed for shared, bot, and dashboard.
- Lint: passed with 0 errors and 6 existing warnings.
- Full tests: 208 files, 1,068 tests passed.
- Build: passed for bot and dashboard.
- Local Brain release gate: passed with Ollama 0.32.1, `qwen3:8b`, `nomic-embed-text:latest`, policy 36/36, retrieval 25/25, top-1/top-3/grounding 1.0, and zero privacy/injection/stale-memory failures.
- Controlled demo: passed; grounded Today focus, preference recall, correction behavior, cross-owner exclusion, injection exclusion, risky action waiting, zero action calls, and real Qwen `local_only` routing in 3886.5 ms.
- Browser proof: passed; evidence under `output/playwright/local-brain-browser-proof/2026-07-18T07-19-19-238Z/`, not committed.
- WhatsApp release gate: passed in dry/no-send scope; customer gate allows private owner use but blocks public sale; tenant gate reports `safe_for_public_sale=no`.
