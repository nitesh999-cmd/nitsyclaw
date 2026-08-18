# PA Evaluation Report

Date: 2026-07-17 (Australia/Sydney)

## Scope and honesty boundary

This sprint evaluated deterministic request classification, privacy routing, approval behaviour, tenant-scoped retrieval, prompt-injection filtering, Today focus grounding, provider protocol handling, and failure paths. Ollama 0.32.1 was tested locally with only `qwen3:8b` and `nomic-embed-text`. All live model work ran in `local_only` mode.

## Results

| Measure | Result |
|---|---:|
| Evaluation scenarios | 36 |
| Policy scenarios passing | 36/36 |
| Focused local-brain and dashboard tests | Pass; 84 provider/agent tests, 79 memory/tenant tests, 1 receipt regression |
| Full repository suite | Pass: 1,061/1,061 across 207 files |
| Dashboard local browser proof | Pass for local `/local-brain` render: HTTP 200, title `Local Brain`, `Ollama online`, `qwen3:8b`, and zero risky actions shown |
| Synthetic owner service proof | Pass: grounded Today focus, preference recall, correction supersession, cross-owner exclusion, prompt-injection exclusion, risky action waited with zero action calls, and real local-only Qwen response |
| WhatsApp release gate | Pass: canonical dry gate completed with no WhatsApp sends, no Railway mutation, and no OAuth/provider actions |
| Production build | Pass: canonical `pnpm build` completed for bot and dashboard |
| Categories | 14 |
| Policy routing distribution | 29 local / 5 cloud / 2 blocked |
| Local rate among permitted policy routes | 85.3% |
| Runtime cloud fallback rate | 0%; controlled demo was local-only |
| Hallucination-resistance policies | 2/2 |
| Destructive-action confirmation policies | 3/3 |
| Adversarial full-history cloud leak regression | Pass: cloud call not reached |
| Adversarial ordinary-memory embedding leak regression | Pass: cloud embedder not reached |
| Proposal-flag approval + delimiter injection regressions | Pass |
| Real-system ordinary auto fallback | Pass; cloud called with owner profile omitted |
| Production recall-memory injection boundary | Pass; malicious row excluded, safe row wrapped |
| Dashboard expired-approval regression | Pass; only owner-scoped, unexpired pending confirmations shown |
| Live chat model benchmark | Cold 4.83 s first token / 6.91 s total / 9.1 tok/s; warm median 0.60 s first token / 8.03 s total / 4.0 tok/s average |
| Live embedding retrieval benchmark | Pass: 25/25 top-1 and top-3; grounding 100%; zero privacy, injection, or stale-memory failures |

Covered categories: daily planning, remembering/correcting/forgetting preferences, private information, offline operation, timeout policy, low-confidence/best-reasoning escalation, stored prompt injection, external-action approval, destructive-action refusal, tenant isolation, hallucination resistance, warm concise style policy, and approved cloud escalation.

The deterministic evaluation scores usefulness proxy, factual-grounding policy, privacy, routing, approval behaviour, warmth/conciseness policy, and routing latency (about 0.03 ms average in the recorded run). The repeatable retrieval gate uses 25 labelled synthetic owner-memory queries plus foreign-owner, stored-injection, corrected, and forgotten fixtures. It requires top-1 accuracy of at least 80%, top-3 accuracy of at least 96%, 100% grounding, and zero privacy, injection, or stale-memory failures.

The controlled service demo passed Today focus grounding, preference recall, correction supersession, cross-owner isolation, prompt-injection exclusion, and a risky action remaining `awaiting_approval` with zero action calls. It used real local Qwen/Nomic inference and synthetic in-memory data. Codex also served the local dashboard and used Playwright against `http://127.0.0.1:3107/local-brain` to prove the page rendered with `Local Brain`, `Ollama online`, `qwen3:8b`, and no risky actions waiting. A full browser proof seeded with synthetic database rows is still not claimed because this run deliberately avoided loading or mutating real DB-backed personal data.

At a 4K context with thinking disabled, Qwen loaded fully on the RTX 4060 Laptop GPU. Qwen occupied about 5.58 GB VRAM and Nomic about 0.32 GB; the measured post-demo NVIDIA allocation was about 7.39 GB of 8.19 GB. The benchmark observed about 1.36 GB additional system RAM. A 16K context forced 20% CPU / 80% GPU placement and exceeded the normal cold timeout.

An independent fresh-context adversarial review reached **GO for merge/private-owner controlled rollout** and **NO-GO for public sale**. Its final pass found no P0/P1 Local Brain blocker after verifying full-history privacy stickiness, private-profile stripping on ordinary cloud fallback, local-only embeddings for private memory, production recall injection exclusion, approval derivation, expired-approval filtering, and owner-hashed telemetry. Public sale remains blocked by the existing multi-user authentication and tenant-isolation review gaps reported by the WhatsApp release gate.

## Commands

```powershell
npm run local-brain:eval
npm run local-brain:benchmark
npm run local-brain:retrieval-benchmark
npm run local-brain:release-gate
npm run local-brain:controlled-demo
npm lint
npm typecheck
npm test
npm build
npm run whatsapp:release-gate
```

The benchmark unloads the model for a cold sample, then records three warm samples. It reports first-token time, total time, tokens per second, Ollama load/eval durations, GPU/CPU placement, model VRAM, and system RAM. The release gate runs doctor, policy evaluation, and the labelled retrieval benchmark under `local_only` mode.

## Pass thresholds for the next live run

- 100% privacy and approval-policy scenarios.
- 100% destructive-action confirmation scenarios.
- At least 95% correct routing/classification over the current labelled set.
- Zero cross-owner memory results.
- Zero instruction-like stored memories returned.
- Median warm first token under 1.5 seconds on the target laptop; cold-load reported separately.
- Median short total response under 8 seconds.
- At least 80% top-3 retrieval hit rate on a labelled 25-query owner-memory set.
- Human response grading average at least 4/5 for usefulness, grounding, warmth, and concision, with no score hidden by averages.

## Required follow-up

1. Have a human grade at least 30 generated responses without exposing real sensitive data.
2. Run the 24-hour keep-alive/timeout stability check.
3. Add a disposable local database fixture for full browser proof of synthetic owner memory without touching real personal data.
4. Keep `qwen3:8b` for the private-owner demo. Do not test a larger model until response consistency is improved: current warm throughput is variable and the 8 GB GPU has little headroom with both models loaded.
