# Qwen3-ASR V1.3 single-case Hinglish causal diagnostic

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `af2a4de10011578ff65a4b4a6ae52168fb37e554`

Frozen launch commit: `13712ae88a82e67cbed59b454ef9bf3e605bf359`

## Diagnostic verdict

**FAIL. Voice remains NO GO.**

Exactly one V1.3 Hinglish child was submitted on fixed `cuda:0`. No retry,
English case, scorer, scored smoke or quality assessment was performed. The
single-case adapter change worked: the child passed argument validation, loaded
both model shards and entered generation. It did not disappear at the process
lifecycle layer.

The first causal failure is deterministic output encoding:

> `UnicodeEncodeError: 'charmap' codec can't encode characters ...`

The frozen adapter serializes its payload with `ensure_ascii=False` and prints it
at `scripts/voice-eval/qwen3-asr-adapter.py:281`. The bounded child environment
does not set `PYTHONUTF8` or `PYTHONIOENCODING`, so this Windows child selected
`cp1252`. After local generation produced non-ASCII output, `print` failed before
any JSON reached stdout. This explains the prior empty/absent result without an
OOM, GPU driver crash, signal termination, timeout or vanished process.

No transcript content was persisted in stdout and no transcript is reproduced
in this report. Because no transcript was durably captured and no scorer was
authorized, this run supports no ASR-quality verdict.

## V1.3 re-freeze

The versioned shim leaves the historical V1.1 adapter untouched and hash-pins
it. Its argument contract is:

- diagnostic mode: exactly one `--case`
- scored mode: exactly two `--case` values
- `max_new_tokens`: exactly `128`
- model execution: unchanged fixed `cuda:0`, `bfloat16`, local-only model

The execution-affecting V1.3 files were committed before inference. The immutable
V1.3 aggregate is
`0f2c460dbf70b23b6193ba70ff3f3772dede0783ef78f3797d2e46fb55fedddb`.
Its parent V1.1 aggregate remains
`df1b768004fae59a3a2633deb0b311a41848ffaab9df98c95f26901d0fbe4d2a`.

## Frozen invocation and fixture

No-overwrite preflight evidence:
`docs/qwen3-asr-v13-hinglish-preflight-2026-08-11.json`

- Invocation SHA-256: `6b62ca8cb0e589df7037a5467a58af01bc8cbfaed5416484c0d0ae7a09b0e26e`
- Preflight SHA-256: `8764db7876f2a248edbd130d058573c9ce4ffc600ad1874e606821c33c090b30`
- Static freeze SHA-256: `c53745abbfede49c9d4a899916a42d1f466ebba084ba5bb7e5f5cb8701d8ca0f`
- Model revision: `7278e1e70fe206f11671096ffdd38061171dd6e5`
- Model bytes: `4,703,114,308`
- Device / dtype: fixed `cuda:0` / `bfloat16`
- Timeout: `600,000 ms`, unchanged
- Mode: diagnostic; scorer authorization: false; retry authorization: false
- Case: exactly one, `hinglish-business`
- WAV SHA-256: `c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c`
- WAV bytes: `234,818`

The WAV was byte-identical to the previously approved synthetic fixture before
the child was submitted.

## Child lifecycle and causal evidence

Durable process evidence:
`docs/qwen3-asr-v13-fixed-cuda-0-hinglish-diagnostic-process-2026-08-11.json`

Process evidence SHA-256:
`ea5741580b12e9e88688cd67675baa269cfd986cff9f4cb5a2124bf1c2acb0de`

| Field | V1.3 result |
|---|---|
| Process creation | `2026-08-11T09:37:26.777Z` |
| PID | `37020` |
| Spawn | succeeded at `2026-08-11T09:37:26.787Z` |
| Exit / close | code `1` at `2026-08-11T09:37:46.365Z` |
| Signal | none |
| Timeout / cancellation | false / false |
| Graceful / forced termination | false / false |
| Wall-clock duration | `19,782 ms` |
| stdout | `0` bytes, complete stream, not truncated |
| stderr | `1,425` bytes, complete UTF-8, not truncated |
| stderr SHA-256 | `214a0eb8eb1556e4aeb5a99bdb670170769cf330f57e4e148c3284fe7d0d9f47` |
| Transcript parse | `EMPTY` |
| Classification | `NONZERO_EXIT` |
| Resource samples | `21` |
| Exact-PID non-loopback rows | `0` |
| Checkpoint load / generation | reached / reached |
| Payload output | reached, then failed in Windows text encoding |
| Process cleanup | passed |
| Post-exit child / GPU row | absent / absent |
| Running record / private temp directory | absent / absent |

The bounded stderr first records completion of both checkpoint shards, followed
by generation setup, then a traceback at the adapter's final JSON print. The
traceback names the selected `cp1252` encoder and `UnicodeEncodeError`. This is
direct causal evidence, not an inference from a missing event.

## Windows, WER, Reliability Monitor and NVIDIA correlation

Machine-readable host evidence is retained at
`docs/qwen3-asr-v13-host-evidence-2026-08-11.json`.

For the 19:36:30–19:38:30 local inspection window:

- Application record ID remained `822918`; no Application event occurred.
- System record ID remained `141356`; no System or NVIDIA event occurred.
- Reliability Monitor returned zero records.
- WER ReportArchive and ReportQueue contained zero newly written items.
- No OOM, display-driver, access-violation, resource-exhaustion or termination
  evidence correlated with PID `37020`.

## Resources, network and cleanup

- Preflight RAM: `67,756,871,680` total; `34,586,296,320` free.
- Preflight GPU: RTX 4060, `8,188 MiB` total, `2,441 MiB` used,
  `5,516 MiB` free, driver `610.74`.
- The sampler recorded `4,894,720` bytes as peak child working set, but this is
  not a credible process peak because it conflicts with completed checkpoint
  loading. It is retained as observed telemetry, not reported as peak RAM proof.
- WDDM exposed no per-process GPU memory, so exact peak VRAM is unavailable.
- Postflight RAM free was `34,662,944,768` bytes; GPU was `2,548 MiB` used and
  `5,409 MiB` free. These are system-wide observations, not child peaks.
- Exact-PID monitoring observed zero non-loopback connections. Python socket
  access was denied before third-party imports and the offline environment was
  forced. No kernel firewall rule was available.
- PID `37020`, its GPU row, `.running` evidence and all V1.3 private temp
  artifacts were absent after exit.

## Verification

| Check | Result |
|---|---|
| Python V1.3 adapter syntax | PASS — isolated `ast.parse`, no adapter execution |
| V1.1 freeze verifier | PASS — aggregate `df1b768004fae59a3a2633deb0b311a41848ffaab9df98c95f26901d0fbe4d2a` |
| V1.3 freeze verifier | PASS before and after inference — aggregate `0f2c460dbf70b23b6193ba70ff3f3772dede0783ef78f3797d2e46fb55fedddb` |
| Focused Qwen telemetry and guard suite | PASS before and after inference — 5 files, 40 tests |
| Focused non-live voice suite | PASS — 10 files, 251 tests |
| Workspace typecheck | PASS — shared, bot and dashboard |
| Full lint | PASS — 0 errors, 5 pre-existing warnings |
| Focused Semgrep | PASS — 4 local rules, 2 targets, 0 findings; metrics off |
| Focused secret scan | PASS — 9 files, 8 pattern families, 0 findings |
| Evidence JSON parsing and causal invariant inspection | PASS |
| `git diff --check` | PASS |

No scorer test, scorer command, second child or model inference was included in
the post-diagnostic verification.

## Scope and next action

No model, package, dependency, prompt, audio, timeout, precision or device was
changed. No download, network inference, WhatsApp activity, restart, OAuth
change, push, merge, deployment or publication occurred.

The minimum next action is a separately approved V1.4 transport-only re-freeze:
force UTF-8 for the child JSON channel, add deterministic non-ASCII payload tests,
and authorize at most one retry of the same synthetic Hinglish case. A scored run
or live WhatsApp test remains unauthorized.
