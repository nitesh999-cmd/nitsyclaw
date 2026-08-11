# NitsyClaw Voice Verifier V1 specification

Status: frozen implementation boundary. This specification authorizes no model
execution, WhatsApp activity, external action, deployment, or live voice proof.

## Purpose

Voice Verifier V1 keeps the immutable ASR transcript, deterministic
interpretation, semantic advisory evidence, and proposed action separate. It
can allow transcription, conversation, retrieval, and local drafting, but it
cannot authorize an external action from voice.

## Authority order

1. Immutable raw transcript and byte/correlation evidence.
2. Deterministic Unicode and typed-value verification.
3. Exact owner-scoped contact and product records.
4. Advisory semantic evidence that cites exact raw spans.
5. Explicit owner text confirmation in a later, separately authorized flow.

Recognizer agreement and semantic-model agreement are corroborating signals
only. They never grant action authority or delivery proof.

## Fixed safety rules

- `externalActionAllowed` is always `false` in V1.
- Provider confidence remains `null` when unavailable and is never fabricated.
- Raw transcript text is immutable.
- NFC is permitted. Compatibility folding, fuzzy repair, edit-distance repair,
  phonetic repair, and automatic critical-field transliteration are forbidden.
- Unicode control/format characters, bidi controls, zero-width characters, and
  mixed-script critical tokens fail closed.
- Exact numbers, signs, units, phone digits, dates, times, percentages, product
  models, actions, negation, and correction state remain separate channels.
- A Roman/Devanagari form can resolve an identity only when that exact form is
  present in an active, owner-scoped, verified alias record.
- Zero or multiple matching contacts/products never resolve automatically.
- New aliases are candidates only and are never persisted by the verifier.
- Semantic evidence is untrusted, has no tools, must validate structurally, and
  must cite byte-equivalent raw transcript spans.
- Missing, invalid, invented, stale, contradictory, or timed-out semantic
  evidence cannot lower a risk tier.
- Corrections supersede only a pending proposed field. They do not rewrite raw
  evidence, replay work, or create long-term memory.
- Quoted/background speech and ambiguous negation require text restatement.
- Timeout, cancellation, process restart, or correlation mismatch invalidates
  any pending voice-derived proposal.

## Typed channels

The verifier independently records action, recipient, product/model, amount,
currency, percentage, date, time, timezone, location, phone, power/energy unit,
negation, correction, Unicode status, resolution status, and evidence spans.

Resolution states are `exact`, `candidate`, `ambiguous`, `missing`, and
`rejected`. Only `exact` values may populate a future external-action payload.

## Fixed tier policy

| Tier | Meaning | V1 disposition | Expiry |
|---|---|---|---|
| T0 | Transcript/show transcript | allow transcript display | 45-second processing deadline |
| T1 | Conversation, no external effect | allow conversation | current turn only |
| T2 | Retrieval or local-only draft | allow local preview when unambiguous | 15 minutes |
| T3 | Reversible external action | require text confirmation; do not execute | 2 minutes |
| T4 | Recipient, financial, legal, account, deletion, or consequential action | require full text restatement; do not execute | 1 minute |

Restart never restores approval authority. A persisted proposal may be shown
for review, but must be reconfirmed through a future approved text flow.

## Frozen discrepancy classifications

| Observed surface | Frozen V1 classification |
|---|---|
| `3:30 p.m.` | demonstrably equivalent to `15:30` |
| `10 kilowatt` | demonstrably equivalent to `10|kW` |
| `रवि` | candidate equivalent unless an exact verified contact alias resolves |
| `सिडनी` | candidate equivalent unless an audited location alias resolves |
| `टेस्ला` | candidate equivalent unless an exact verified product alias resolves |
| `पावरवुल थ्री` | genuinely incorrect product surface; no fuzzy repair |
| `15 परसेंट` | candidate percentage surface; no silent approval |
| `क्वोट … चेक` | ambiguous quote-check intent; require restatement |

These classifications do not amend or reinterpret the Qwen V1.5 `FAIL`.

## Fixed release thresholds

- Existing English WER maximum: `0.20`.
- Existing Hinglish WER maximum: `0.40`.
- Critical-field, action/intent, negation/context, and language accuracy: `1.0`.
- Frozen negative, mutation, Unicode, and command-safety false accepts: `0`.
- Invalid or invented semantic fields accepted: `0`.
- Cross-owner, cross-contact, cross-turn, and replay correlations: `0`.
- Unauthorized T0-T2 external actions: `0`.
- External actions authorized by Voice Verifier V1: `0`.
- Deterministic verifier p95 target: `250 ms`.
- Semantic advisory p95 target: `5,000 ms`; hard deadline: `10,000 ms`.
- Cleanup and fail-closed error handling: `100%`.
- Non-loopback network connections during offline verification: `0`.

No threshold may be changed after observing candidate or model output. The
216-clip corpus remains outside this V1 implementation boundary.
