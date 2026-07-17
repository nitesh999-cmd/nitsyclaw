# NitsyClaw Local Brain: 30-Day Roadmap

## Week 1 — prove the local core

- Manually pull `qwen3:8b` and `nomic-embed-text`.
- Capture cold/warm first-token, total latency, memory use, model-load time, and 30-response human grades.
- Run a 24-hour local keep-alive/timeout stability test.
- Create 25 synthetic owner-memory queries and tune retrieval thresholds.
- Prove Ollama-offline behaviour for private, ordinary, and local-only requests.

Exit: evidence supports keeping the selected models, or a measured model swap is proposed.

## Week 2 — make memory durable and correct

- Design a reversible dual-embedding schema with model, dimension, version, source, and generated-at metadata.
- Add an owner-scoped backfill dry run; no destructive rewrite of existing 1536-dimensional vectors.
- Add correction/forget/temporary-memory end-to-end tests.
- Add retrieval observability that stores IDs/scores only, never memory content.

Exit: local retrieval survives restart and passes tenant/injection/quality gates.

## Week 3 — improve daily usefulness

- Add secure calendar/inbox evidence to the dashboard read model.
- Add direct final-token streaming after tool rounds.
- Add a clear per-turn “use stronger cloud reasoning” disclosure and approval expiry.
- Add one-click reversible actions: prepare draft, snooze, reschedule, or mark local work done.

Exit: the Today slice saves real owner time for seven consecutive days without hidden provider claims.

## Week 4 — package a sellable private PA proof

- Run the full WhatsApp release gate, security scan, tenant gate, build, and authenticated dashboard smoke.
- Record a two-minute owner demo and five failure demos: offline, missing model, timeout, injection memory, denied destructive action.
- Interview five privacy-conscious prospects; ask what they would pay for owner-hosted/private reasoning.
- Turn the validated slice into one narrow offer: setup + private daily focus + memory + approvals, with explicit hardware/provider boundaries.

Exit: either one paid design partner commits, or the top objections define the next sprint.

## Guardrails throughout

- No public Ollama port or casual tunnel.
- No sensitive cloud fallback without explicit approval.
- No action execution based only on model prose.
- No public-sale claim until tenant isolation and auth gates pass.
- No model upgrade based on benchmark hype; use NitsyClaw tasks and the target laptop.
