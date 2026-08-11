# Qwen3-ASR V1.1 diagnostic re-freeze evidence

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `ba6cf3c4f9f1f1a69a1894e3181c425948c6d1c6`

## Decision

**BLOCKED. Voice remains NO GO.**

The V1.1 process wrapper is repaired and deterministically tested, and the one
authorized non-scored diagnostic completed with a real English transcript on the
pinned model and fixed `cuda:0`. The child exited zero. It did not reproduce or
explain the previous two-case child disappearance, so the first causal inference
failure remains unproved. The scored two-case run was therefore not performed.

`device_map="auto"` was not used. Neither GPU OOM nor invalid fixed-device
placement was proved. The final freeze explicitly sets
`scoredRunAuthorized: false`, which blocks the scored command before model
verification or process submission.

## Exact old-wrapper defect

The V1 wrapper collected stdout and stderr but parsed stdout inside its `close`
handler before returning the lifecycle record. Empty stdout caused
`parseSingleJsonObject` to throw a new generic error. That rejection discarded
the captured stderr, exit code, signal, timestamps and stream state. It also did
not persist `spawn`, `exit`, `close`, timeout escalation, stream completion or
resource observations.

The defect was reproduced without inference: a synthetic Node child wrote a
causal stderr line and exited `23`; the old wrapper exposed only
`Local evaluator returned no JSON result.` with no diagnostic properties.

## V1.1 repair

V1.1 now:

- publishes a non-overwriting atomic `RUNNING` record before spawn and a separate
  atomic `FINAL` record only after child close, both stream closures and cleanup;
- captures sanitized executable identity and argument structure, PID, spawn,
  error, exit, close, exit code, signal, timeout, cancellation, graceful and
  forced termination, duration, bounded decoded stdout/stderr and truncation;
- classifies `SPAWN_FAILURE`, `NONZERO_EXIT`, `SIGNAL_TERMINATION`, `TIMEOUT`,
  `CANCELLED`, `OUTPUT_LIMIT_EXCEEDED`, `OOM_PROVEN`,
  `DEVICE_PLACEMENT_FAILURE`, `ZERO_EXIT_EMPTY_OUTPUT`, `MALFORMED_OUTPUT`,
  `NO_TRANSCRIPT` and `SUCCESS` without using arbitrary OOM-like text;
- samples exact-PID RAM, NVIDIA process memory and non-loopback TCP rows where
  locally measurable;
- rejects schema-invalid JSON and records cleanup on every deterministic path;
- redacts paths, explicit redaction values, authorization/token-like fields and
  ANSI output without storing the full environment;
- preserves prior attempts because atomic publication refuses to overwrite an
  existing evidence path;
- keeps diagnostic and scored modes separate and freezes scoring off until a
  causal failure has been established and separately repaired.

## Frozen components

The diagnostic ran only after the pre-inference V1.1 aggregate
`09aef21b7626011d822995a12ad45c93120e4337d93d4dc0c07b298148bb8fe6`
verified. After the diagnostic, only the fail-closed scored-authorization gate,
pre-spawn duplicate guard, lint-equivalent regex spelling and synthetic
credential-fixture spelling were changed; no further inference occurred. The final frozen aggregate is
`df1b768004fae59a3a2633deb0b311a41848ffaab9df98c95f26901d0fbe4d2a`.

The unchanged prior scoring aggregates remain:

- V2: `d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b`
- V2.1: `fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5`

The final manifest records every component hash, the pinned runtime and model,
one diagnostic case, two scored cases, offline environment policy, atomic
no-overwrite requirement and `scoredRunAuthorized: false`.

## Authorized diagnostic result

Durable process evidence:
`docs/qwen3-asr-v11-fixed-cuda-0-diagnostic-process-2026-08-11.json`

SHA-256:
`8635802fd6af0a6b4f23f4c65ff43401e8e8196edcc908a3d4dd039bddefa47e`

| Field | Result |
|---|---|
| Process outcome | `SUCCESS` |
| PID | `51520` |
| Spawn | succeeded |
| Exit / close | code `0`, no signal |
| Timeout / cancellation | false / false |
| Output truncation | false |
| Wall-clock process time | `38,425 ms` |
| Model load | `3,245 ms` |
| English inference | `3,750 ms` |
| Peak child RAM | `5,235,372,032` bytes |
| Peak CUDA reserved | `4,726,980,608` bytes |
| Resource samples | `39` |
| Observed non-loopback TCP rows | `0` |
| stdout | `1,352` bytes, valid UTF-8 and parsed JSON |
| stderr | `495` bytes, valid UTF-8, fully retained |
| stderr SHA-256 | `a12375b07fca5f40be715e4fff9e91b359ad4c181f821fe5f64530a7a11605a5` |
| Atomic running record after final | absent, as expected |
| Private temp artifacts after run | `0` |
| Child process after exit | absent |
| Exact child GPU row after exit | absent |

The bounded stderr contains only local checkpoint progress plus Transformers
generation warnings. Its exact sanitized value is retained in the process JSON.

Exact diagnostic transcript:

> Please call Raj Sharma in Melbourne tomorrow at 3:30 p.m. about the 10 kilowatt Fronius solar inverter.

This is a synthetic evaluation sentence, not a personal or customer recording.
No confidence value was available or manufactured; `providerConfidence` remains
`null` and external actions remain disabled.

The adapter reported `9,568,256` CUDA allocated bytes and `3,456,106,496` CUDA
reserved bytes immediately before its process exited, so the outer command
returned `1` with `cleanupPassed: false`. Post-exit checks then proved the exact
PID and its NVIDIA process row were gone and the temp inventory was restored.
This is an explicit distinction between pre-exit allocator state and operating-
system process cleanup; it is not delivery or quality proof.

## OOM, placement and scoring decision

- OOM proved: **no**
- Fixed-device placement failure proved: **no**
- `device_map="auto"` used: **no; prohibited by the observed result**
- Newly authorized scored two-case run used: **no**
- Raw scored English transcript: **none; scored run not performed**
- Raw scored Hinglish transcript: **none; scored run not performed**
- Frozen V2/V2.1 scores: **none; scored run not performed**
- Critical-field verdict: **not evaluated; voice remains NO GO**

The diagnostic English transcript cannot explain why the previous combined run
disappeared and cannot justify scoring or release. A separately approved,
single-case diagnostic of the unchanged existing Hinglish fixture is the minimum
next causal step.

## Deterministic regression coverage

The focused suite covers:

- successful stdout/zero exit; stderr/nonzero; zero/nonzero empty stdout;
- spawn failure and immediate early exit;
- stdout/stderr race and complete stream closure;
- bounded large stderr and output-limit termination;
- malformed UTF-8, malformed JSON and schema-invalid JSON;
- graceful timeout, forced-kill escalation, cancellation and child crash;
- structured CUDA OOM, structured device failure and false OOM-like text;
- parsed output without a transcript;
- atomic final-write interruption while preserving the prior attempt;
- pre-spawn duplicate blocking when a final evidence path already exists;
- cleanup on all paths, secret/path redaction, resource/network telemetry;
- deterministic repeated classification and redaction;
- adapter mode separation and fail-closed scored authorization ordering.

## Verification

| Check | Result |
|---|---|
| Final V1.1 freeze verifier | PASS — 9 files, aggregate matched |
| Focused Qwen suite | PASS — 5 files, 40 tests |
| Complete voice suite | PASS — 10 files, 251 tests |
| Non-live WhatsApp release gate | PASS — no send, restart or provider mutation |
| Complete unit/integration suite | PASS — 231 files, 1,302 tests |
| Workspace typecheck | PASS — shared, bot and dashboard |
| Lint | PASS — 0 errors, 5 pre-existing warnings |
| Production build | PASS — bot and dashboard |
| Focused Semgrep | PASS — 4 rules, 7 targets, 0 findings; metrics off |
| Focused secret scan | PASS — 12 files, 8 patterns, 0 findings |
| Python runtime lock | PASS — 50/50 runtime packages; bootstrap `pip` excluded |
| Python `pip check` | EXPECTED NONZERO — six intentionally omitted web/demo/omni declarations |
| Node lockfile | PASS — unchanged |
| Node dependency audit | FAIL — 38 existing advisories: 25 high, 13 moderate, 0 critical |
| Model/runtime/audio downloads | PASS — none |
| `git diff --check` | PASS |

No WhatsApp message, restart, customer/owner recording, cloud inference, model or
package download, dependency upgrade, OAuth change, push, merge, deployment or
publication occurred.

## Exact next action

`APPROVE QWEN SMOKE V1.2 SECOND-CASE CAUSAL DIAGNOSTIC — one existing synthetic Hinglish case only, fixed cuda:0, frozen V1.1 telemetry, no scored run, no WhatsApp sends.`
