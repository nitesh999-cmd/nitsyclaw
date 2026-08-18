# Personal Assistant Architecture

## Flow

```text
WhatsApp / private dashboard
        |
        v
Capture -> Understand -> Retrieve -> Propose -> Approve -> Act -> Remember
              |             |           |          |
              |             |           |          +-- audit tool outcome
              |             |           +-- external/destructive gate
              |             +-- owner-scoped local memory, provenance, injection filter
              +-- deterministic request class + sensitivity + complexity
                                    |
                                    v
                         Privacy-aware model router
                         /          |             \
                  local Ollama   cloud model     blocked
                   preferred     permitted       honest stop
```

Deterministic shortcuts and command-job approval checks run before general model work. The same feature registry and agent loop serve WhatsApp and dashboard; the model adapter is injected through `AgentDeps` rather than imported inside tools.

## Routing policy

| Request | Auto mode | Cloud without explicit approval? | Action gate |
|---|---|---:|---|
| Answer-only, ordinary, simple | Local preferred; ordinary fallback allowed | Yes, if local unavailable/fails | None |
| Read-only private investigation | Local or blocked | No | None |
| Reversible local action | Local preferred | Only for ordinary data | Execute locally |
| Difficult reasoning with wholly ordinary full payload | Cloud preferred; local degraded path if cloud absent | Yes | None unless action follows |
| Sensitive or highly sensitive | Local or blocked | No | Explicit cloud approval required |
| External action | Reason locally where possible | Routing policy still applies | Explicit action approval |
| Destructive/sensitive action | Local or blocked | No implicit escalation | Strong confirmation; no automatic execution |

Routing telemetry contains mode, class, sensitivity label, route, model name, reason code, timing, success, and fallback flag. It does not contain prompt text, memory content, tool payload bodies, tokens, credentials, or personal identifiers.

Sensitivity is sticky across dynamic conversation history, the current request, synthetic tool results, and non-standard system context. The known static NitsyClaw policy is excluded from lexical sensitivity checks, while its marked private profile block is stripped before any cloud call. The request class and complexity come from the latest user turn, but a private item anywhere in the dynamic payload prevents implicit cloud routing. The only sensitive cloud approval is the exact `cloud approved for this full conversation context:` prefix, making the disclosure scope explicit.

## Memory safety

- Every candidate is filtered by `ownerHash` before scoring.
- At most 30 recent candidates are embedded/reranked per request.
- Corrected and forgotten tags are excluded.
- Instruction-like stored text is penalised and removed from results.
- Retrieved text is wrapped as untrusted reference material, never as system instructions.
- The production `recall_memory` tool filters instruction-like rows, returns exclusion counts, wraps every safe result, and the system policy forbids following instructions inside those blocks.
- Results include source, timestamp, confidence, score, and kind.
- Saved-memory embedding does not silently fall back to OpenAI when local embeddings are unavailable; it stores the memory without a vector and preserves lexical retrieval.

## Approval gates

- Read-only investigation: no approval.
- Reversible local preparation: may proceed and report what changed.
- Send, email, message, call, booking, purchase, payment, external post, upload, or provider write: propose first and wait for exact approval.
- Delete, wipe, revoke, overwrite, or secret rotation: strong confirmation with exact scope; local reasoning cannot bypass it.
- A model tool call is a proposal. Tool registry, schemas, tenant scope, command jobs, and confirmation records are the enforcement layer.

## Failure modes and response

| Failure | Behaviour |
|---|---|
| Ollama offline | Private/local-only request blocks with recovery guidance; ordinary auto-mode request may use configured cloud fallback. |
| Chat model missing | Health is degraded; local calls fail with the exact missing model name. |
| Embedding model missing | Semantic memory retrieval stops; saved memory can persist without a vector and no text goes to cloud. Deterministic/lexical DB evidence still works. |
| Ollama timeout | Bounded retry; cancellation propagated; only permitted ordinary fallback can run. |
| Invalid JSON/tool output | Typed provider error; no guessed action arguments. |
| Stored prompt injection | Candidate marked instruction-like, excluded, and counted for operator visibility. |
| DB unavailable | Dashboard renders an explicit unavailable state; no fake empty day. |
| Maximum tool rounds | Routed model produces a final honest summary; no direct bypass to a cloud SDK. |
| Vercel cannot reach laptop | Local Brain shows offline. No public tunnel is created automatically. |

## Threat model

- Prompt leakage: mitigated by prompt-free telemetry and redacted audit logging.
- Cross-tenant memory: mitigated by owner-scoped DB queries and retrieval recheck; public sale still requires the wider tenant gate in `AUDIT_STANDARD.md`.
- Prompt injection from memory/docs: mitigated by untrusted-context wrapping, detection, filtering, and tool-policy enforcement.
- SSRF/remote Ollama exfiltration: provider accepts loopback/local/private-network HTTP only and rejects public hosts.
- Model hallucinated actions: tool schemas and confirmation rail are authoritative; narrative text cannot execute.
- Sensitive cloud fallback: denied unless explicit per-request approval is supplied.
- Resource exhaustion: bounded context, candidates, tokens, retries, health cache, and timeouts.
- Model supply chain: model pulls are manual, exact-name steps; the sprint did not download models automatically.
