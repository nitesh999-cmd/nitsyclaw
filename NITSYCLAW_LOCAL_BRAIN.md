# NitsyClaw Local Brain

## What exists now

NitsyClaw has one privacy-aware model boundary shared by the WhatsApp bot and dashboard chat. Ollama is the preferred path for private everyday work; Anthropic is optional. Routing classifies all dynamic history, current turns, tool results, and non-standard system context, so earlier private context cannot ride a later ordinary request into cloud. The known static policy is not mistaken for personal data, and the marked private profile block is removed before any cloud call. OpenAI embeddings are never a silent fallback for saved memory.

The adapter includes model discovery, health checks, timeouts, cancellation, bounded retries, streaming NDJSON parsing, tool calls, structured JSON, context limits, keep-alive, embeddings, and actionable offline/model-missing errors. No new runtime dependency was added.

The personal-assistant loop is explicit: Capture -> Understand -> Retrieve -> Propose -> Approve -> Act -> Remember. External or destructive actions cannot cross the approval rail. Retrieved memory is owner-scoped, carries source/time/confidence, excludes corrected/forgotten rows, and treats stored text as untrusted data.

## Wow slice

Ask WhatsApp:

```text
What should I focus on today?
```

NitsyClaw ranks up to three evidence-backed priorities from the chosen daily focus, reminders, approvals, active command jobs, saved commitments, and—when connected on the bot—calendar and inbox context. Each item explains why it matters and gives the smallest reversible next action. Missing sources are named rather than invented.

Ask:

```text
Local brain status
```

The reply reports Ollama state, privacy mode, selected models, and next setup action without exposing prompts or secrets.

The private dashboard adds:

- Today: three priorities, why each matters, smallest next step, overdue risk, and a preparation-only CTA.
- Local Brain: online/degraded/offline state, selected model, privacy mode, last route and reason, latency, locally retrieved memories with provenance, filtered instruction-like memories, and waiting approvals.

## Demo

1. Start Ollama and install the two documented models in `OLLAMA_SETUP.md`.
2. Configure `.env.local` with `NITSYCLAW_MODEL_MODE=local_only` and the exact model names.
3. Run `npm run local-brain:doctor`, `npm run local-brain:release-gate`, `npm run local-brain:benchmark`, and `npm run local-brain:controlled-demo`.
4. Start the bot with `npm run bot` and the dashboard with `npm run dashboard`.
5. Send “local brain status”, then “what should I focus on today?” in the owner WhatsApp chat.
6. Open `/` and `/local-brain` in the authenticated dashboard.
7. Try a private request while Ollama is stopped: it must block rather than silently send private text to cloud.
8. Try “send an email to Alex”: NitsyClaw may prepare/propose, but sending must remain approval-gated.

To approve cloud handling for one turn, use the exact disclosure prefix below. It approves the full conversation context sent with that turn, not only the words after the colon:

```text
cloud approved for this full conversation context: <request>
```

## Current limitations

- `qwen3:8b` is sufficient for the current private-owner demonstration at 4K context with thinking disabled. Warm total latency varied from about 3.7 to 8.3 seconds and averaged about 4.0 tokens/second, so response consistency and human quality still need proving before sale.
- The 25-query retrieval gate passed 25/25 top-1 and top-3 with zero privacy, injection, or stale-memory failures. It is synthetic release evidence, not proof over real owner data.
- Codex verified the local dashboard route returned HTTP 200 and used Playwright to prove `/local-brain` rendered `Local Brain`, `Ollama online`, `qwen3:8b`, and no risky actions waiting. Full browser proof with seeded synthetic owner database rows remains unverified because this run deliberately avoided loading or mutating real DB-backed personal data; the service-level controlled demo passed those exact synthetic-owner scenarios.
- Automatic cloud routing applies only when the complete dynamic conversation/tool context is ordinary. The private profile block is omitted from cloud prompts; private history remains sticky and forces local or blocked routing unless the exact full-context approval prefix is used.
- Dashboard tool-loop output is flushed in small chunks after each routed model step. The Ollama provider itself supports true streaming; the dashboard orchestration still buffers tool decisions before execution for safety.
- Existing Postgres memory vectors are 1536-dimensional. `nomic-embed-text` uses a different dimension, so local retrieval reranks a bounded owner-scoped candidate set in memory rather than corrupting the existing vector column. A dual-column migration needs a separate measured rollout.
- The Vercel dashboard cannot reach a laptop-only `127.0.0.1` Ollama service. Local Brain health will correctly show offline there unless a private network bridge is deliberately designed and secured.
- Calendar/email aggregation is available on the always-on bot when provider tokens are configured; the dashboard Today surface labels those sources unavailable.

## Backlog

1. Human-grade 30 local responses and run a 24-hour keep-alive/timeout stability check.
2. Add dual-dimension embedding storage with model/version metadata and a reversible backfill.
3. Stream final local tokens directly through the dashboard route after tool completion.
4. Add explicit per-turn cloud escalation UI with clear data disclosure and expiry.
5. Add a local-only end-to-end evaluation fixture using a disposable database owner.
6. Add calendar and inbox evidence to the dashboard through a secure bot-to-dashboard read model.
7. Tune retrieval thresholds from labelled personal-memory examples after enough privacy-safe owner-shaped fixtures exist.
