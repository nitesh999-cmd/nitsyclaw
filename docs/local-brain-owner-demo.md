# Local Brain owner demonstration

This is a private, synthetic demonstration of Local Brain. It is not a public launch or evidence that multi-user sale is ready.

## Run it

Prerequisites:

- Ollama is running on `http://127.0.0.1:11434`.
- Only `qwen3:8b` and `nomic-embed-text:latest` are required.
- The shell must not contain a real `DATABASE_URL`, cloud-provider key, Railway marker, or Vercel marker.

Run:

```powershell
cd C:\Users\Nitesh\projects\NitsyClaw-integrate-local-brain
pnpm run local-brain:owner-demo
```

The command starts a temporary localhost dashboard, loads the fail-closed synthetic fixture, permits browser traffic only to localhost, records at 1920x1080, captures screenshots, writes machine-readable evidence, and tears the server down. Outputs are ignored under `output/playwright/local-brain-owner-demo/`.

If `ffmpeg` is already installed, the runner also creates MP4. Otherwise, Playwright WebM is the supported output. The runner never installs video tools.

## Story and proof

1. Private by design: `qwen3:8b`, Ollama, and `local_only` are visible.
2. Remembers what matters: the current peppermint-tea preference is recalled for the synthetic owner.
3. Learns corrections: the stale preference is excluded and the corrected memory remains active.
4. Protects boundaries: another owner's memory and stored prompt-injection content are excluded.
5. Refuses risky action: the synthetic WhatsApp action remains waiting for approval with zero action calls.
6. Local response: a real Qwen response is generated through the local-only route.

The caption overlay exists only inside the recording runner. It is not part of the normal product UI.

## Safety boundaries

- Synthetic owner, memories, receipt, reminder, and approval only.
- No real database URL is accepted.
- No production, Railway, or Vercel environment is accepted.
- No WhatsApp, email, calendar, analytics, OAuth, cloud model, or provider key is available to the child process.
- Browser network is restricted to loopback hosts.
- Any risky action must remain `awaiting_approval` with zero outbound action calls.

## Honest claim boundary

Safe to say: Local Brain can recall owner-scoped synthetic context, apply a correction, exclude another owner's memory and hidden instructions, hold a risky action for approval, and produce a real local Qwen response on this laptop.

Do not claim: public multi-user readiness, production tenant isolation, live provider connectivity, automatic WhatsApp sending, cloud independence outside this laptop, or protection against every possible attack. Those need separate production proof.

See [local-brain-owner-demo-voiceover.md](./local-brain-owner-demo-voiceover.md) and [local-brain-owner-demo-live-script.md](./local-brain-owner-demo-live-script.md).

## Recorded evidence - 2026-07-18

Original visual assessment: the page was calm, readable, and trustworthy, but the synthetic section looked like an engineering test report. Raw values such as `awaiting_approval`, `action calls 0`, `local / local_only`, and repeated `PASS` rows weakened the ordinary-person story.

Presentation improvements:

- Replaced demo-only technical labels with plain-English privacy, memory, correction, boundary, approval, and local-response statements.
- Kept machine-readable proof text available to the automated gate without displaying test jargon in the visual presentation.
- Exposed the real synthetic Qwen response already produced by the fail-closed fixture.
- Added temporary recording captions, deliberate cursor movement, readable pacing, clean scene transitions, refresh recovery, and 1920x1080 capture.

Successful run:

- Command: `pnpm run local-brain:owner-demo`
- Result: pass in 86 seconds of command time; evidence timestamps span 81.9 seconds.
- Video: `output/playwright/local-brain-owner-demo/2026-07-18T08-11-30-290Z/local-brain-owner-demo.mp4`
- Playwright source video: `output/playwright/local-brain-owner-demo/2026-07-18T08-11-30-290Z/local-brain-owner-demo.webm`
- Hero: `output/playwright/local-brain-owner-demo/2026-07-18T08-11-30-290Z/00-hero-clean.png`
- Scenes: `output/playwright/local-brain-owner-demo/2026-07-18T08-11-30-290Z/01-private-by-design.png` through `06-local-response.png`
- Evidence: `output/playwright/local-brain-owner-demo/2026-07-18T08-11-30-290Z/evidence.json`
- Safety: synthetic fixture only, no real DB URL, `local_only`, zero outbound action calls, zero blocked external browser requests, privacy scan pass.

The first recording attempt exposed a browser-callback transform defect and the second exposed a Next development refresh removing the temporary caption. Both runs failed closed. The runner was corrected to use browser-safe DOM assignments, bind Next to loopback, and recreate captions after a refresh. The third complete recording passed.

Verification after the presentation change:

- Focused tests: pass; 3 files, 40 tests.
- `pnpm typecheck`: pass for shared, bot, and dashboard.
- `pnpm lint`: pass with zero errors and six existing warnings.
- `pnpm build`: pass for bot and dashboard.
- `pnpm run local-brain:release-gate`: pass; policy 36/36, retrieval 25/25, top-1/top-3/grounding 1.0, zero privacy/injection/stale-memory failures.
- `pnpm run local-brain:browser-proof`: pass; refreshed evidence at `output/playwright/local-brain-browser-proof/2026-07-18T08-14-37-316Z/`.
- `pnpm run whatsapp:release-gate`: pass in explicit dry/no-send scope.

Remaining limitation: this is strong owner-only synthetic demonstration evidence. It is not public-sale or production multi-user evidence; the existing account-aware session and tenant-review blockers remain unchanged.
