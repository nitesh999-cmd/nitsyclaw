# Qwen3-ASR V1.2 single-case Hinglish causal diagnostic

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `7c707fa722b8ba954f1715988e32716800c38995`

## Diagnostic verdict

**BLOCKED. Voice remains NO GO.**

Exactly one V1.2 child was submitted. It did not disappear. It spawned as PID
`50280`, emitted one valid structured error payload, exited and closed with code
`2`, no signal, no timeout and no cancellation, and was fully cleaned up. No
second attempt, scorer, English case, scored smoke or model-quality assessment
was performed.

The first causal error is deterministic and precedes model loading:

> `ValueError: the bounded smoke requires exactly two cases`

The frozen V1.1 adapter requires exactly two `--case` arguments in `_arguments()`
before it validates audio, validates model files, imports PyTorch or initializes
CUDA. Only after that two-case requirement does diagnostic mode select
`cases[:1]`. V1.1 succeeded because its runner supplied both frozen cases and the
adapter selected the first, English case. The authorized V1.2 contract supplied
only the Hinglish case, so unchanged V1.1 cannot reach Hinglish inference without
also supplying an unauthorized English case.

This is a proven invocation-contract defect, not an OOM, GPU placement failure,
driver crash, child disappearance or ASR-quality result. The original inference
disappearance remains causally unresolved because V1.2 did not reach model load
or inference.

## Earlier V1.1 outcome, fully reconciled

V1.1 process evidence is unchanged at
`docs/qwen3-asr-v11-fixed-cuda-0-diagnostic-process-2026-08-11.json` with SHA-256
`8635802fd6af0a6b4f23f4c65ff43401e8e8196edcc908a3d4dd039bddefa47e`.

| Field | V1.1 result |
|---|---|
| Attempt | `qwen3-asr-v11-fixed-cuda-0-diagnostic` |
| Process creation | `2026-08-11T08:09:01.660Z` |
| PID | `51520` |
| Spawn | succeeded at `2026-08-11T08:09:01.672Z` |
| Process error event | none |
| Exit | code `0` at `2026-08-11T08:09:39.815Z` |
| Close | code `0` at `2026-08-11T08:09:39.815Z` |
| Signal | none |
| Timeout / cancellation | false / false |
| Graceful / forced termination | false / false |
| Wall-clock duration | `38,425 ms` |
| stdout | `1,352` bytes, complete UTF-8, valid JSON |
| stderr | `495` bytes, complete UTF-8, SHA-256 `a12375b07fca5f40be715e4fff9e91b359ad4c181f821fe5f64530a7a11605a5` |
| Transcript parse | `PARSED` |
| Classification | `SUCCESS` |
| Model load / inference | `3,245 ms` / `3,750 ms` |
| Peak child RAM | `5,235,372,032` bytes |
| Peak GPU memory | `4,726,980,608` bytes |
| Resource samples | `39` |
| Exact-PID non-loopback rows | `0` |
| Process cleanup | passed; private evaluation directory removed and temp inventory restored |
| Post-exit child / GPU row | absent / absent |

V1.1 supplied two sanitized case arguments but diagnostic mode selected only the
first case. Its one transcript was the already documented synthetic English
result. The adapter reported non-zero CUDA allocator state before process exit;
the operating system then removed the exact PID and GPU row, so process cleanup
passed. No confidence was exposed or manufactured.

## V1.2 frozen invocation and fixture

The no-overwrite preflight was persisted at
`docs/qwen3-asr-v12-hinglish-preflight-2026-08-11.json` before child creation.

- Invocation SHA-256: `79a08c336ec5698d414cbd964a329ab6de3fa05b3bf03301ef7a97cd165f1261`
- Preflight file SHA-256: `5c3da39639fc8751bbcd29cca48dc119ec188f6b203f6b45c57063ca505bc06d`
- Frozen V1.1 aggregate: `df1b768004fae59a3a2633deb0b311a41848ffaab9df98c95f26901d0fbe4d2a`
- Model revision: `7278e1e70fe206f11671096ffdd38061171dd6e5`
- Device / dtype: fixed `cuda:0` / `bfloat16`
- Timeout: `600,000 ms`, unchanged
- Mode: `diagnostic`; scorer authorization: false
- Cases: exactly one, `hinglish-business`
- WAV SHA-256: `c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c`
- WAV bytes: `234,818`

The WAV is byte-identical to the previously approved synthetic fixture. The
runner, V1.1 process telemetry, adapter, frozen voice spec, synthesizer source,
SAPI script, FFmpeg executable and Python executable were hashed into the
preflight and re-verified immediately before process submission.

## V1.2 child lifecycle

Durable process evidence:
`docs/qwen3-asr-v12-fixed-cuda-0-hinglish-diagnostic-process-2026-08-11.json`

SHA-256:
`3ef10a44bcd6008123bdd3815f9e3f00cd9391de55c67a0ece546c9d3f2c2cbf`

| Field | V1.2 result |
|---|---|
| Process creation | `2026-08-11T09:03:06.443Z` |
| PID | `50280` |
| Spawn | succeeded at `2026-08-11T09:03:06.454Z` |
| Exit / close | code `2` at `2026-08-11T09:03:06.544Z` |
| Signal | none |
| Timeout / cancellation | false / false |
| Graceful / forced termination | false / false |
| Wall-clock duration | `232 ms` |
| Adapter elapsed | `6 ms` |
| stdout | `491` bytes, complete UTF-8, valid structured JSON |
| stderr | `0` bytes, complete, not truncated |
| Transcript parse | `NO_TRANSCRIPT` |
| Classification | `NONZERO_EXIT` |
| Resource samples | `1` |
| Peak child RAM / VRAM | unavailable / unavailable; child ended before a measurable sample |
| Exact-PID non-loopback rows | `0` |
| Adapter CUDA allocated / reserved | `0` / `0` bytes |
| Model load / CUDA initialization / inference | not reached / not reached / not reached |
| Process cleanup | passed |
| Post-exit child / GPU row | absent / absent |
| Running record / private temp directory | absent / absent |

The V1.2 disappearance therefore did **not** reproduce at the child-lifecycle
layer. The model-level failure remains untested because the adapter rejected the
one-case contract first.

## Windows, WER, Reliability Monitor and NVIDIA correlation

Machine-readable host evidence is retained at
`docs/qwen3-asr-v12-host-evidence-2026-08-11.json`.

- Earlier failed two-case window, 13:11:42–13:12:13 local: no relevant
  Application/System event and no Reliability Monitor record.
- V1.1 window, 18:09:01–18:09:39 local: no correlated event. Fifty WER entries
  appeared at 18:10:32–18:10:33, but all referenced queued watchdog dumps dated
  25 May–30 July; none referenced 11 August, Python, Qwen or CUDA.
- V1.2 inspection window, 19:02:30–19:08:30 local: zero Application events,
  zero System events, zero Reliability Monitor records and zero new WER items.
  Application record ID remained `822913`; System remained `141351`.
- No NVIDIA, display-driver, OOM, access-violation, resource-exhaustion or
  termination event correlated with V1.2.

## Resources, network and cleanup

- Preflight RAM: `67,756,871,680` total; `34,834,124,800` free.
- Preflight GPU: RTX 4060, `8,188 MiB` total, `5,246 MiB` used,
  `2,711 MiB` free, driver `610.74`.
- WDDM did not expose per-process GPU memory in the preflight process list.
- Postflight RAM: `35,361,087,488` free.
- Postflight GPU: `3,618 MiB` used, `4,339 MiB` free. These are system-wide
  observations, not child peaks.
- Exact-PID network monitoring observed zero non-loopback connections.
- Python socket access was denied before third-party imports; Hugging Face and
  Transformers offline policy remained forced. No kernel firewall rule was
  available, so isolation remains application-enforced plus exact-PID monitoring.
- PID `50280`, its NVIDIA row, the `.running` record and all V1.2 private temp
  artifacts were absent after exit.

## Verification

| Check | Result |
|---|---|
| V1.1 freeze verifier | PASS — 9 files; aggregate `df1b768004fae59a3a2633deb0b311a41848ffaab9df98c95f26901d0fbe4d2a` |
| Focused Qwen telemetry and guard suite | PASS — 6 files, 44 tests |
| Focused non-live voice suite | PASS — 10 files, 251 tests |
| Workspace typecheck | PASS — shared, bot and dashboard |
| Full lint | PASS — 0 errors, 5 pre-existing warnings |
| Focused Semgrep | PASS — 4 local rules, 2 targets, 0 findings; metrics off |
| Focused secret scan | PASS — 6 files, 8 pattern families, 0 findings |
| Evidence JSON parsing and invariant inspection | PASS |
| `git diff --check` | PASS |

An additional temporary strict TypeScript configuration that included the
frozen evaluation process source did not pass: the unchanged committed
`qwen3-asr-process.ts` has seven existing strict errors at lines 202, 210, 211,
222, 223, 224 and 472. The temporary configuration was removed, the frozen file
was not changed, and the repository's actual workspace typecheck passed. This is
an explicit residual verification limitation, not a V1.2 runtime failure.

The first test launcher also could not resolve `vitest` and `eslint` through
`pnpm exec` in this checkout. The exact same local tools were then invoked via
their repository shims and completed successfully with the results above.

## Scope and next action

No model, package, dependency, prompt, audio, timeout, precision or device was
changed. No download, network inference, WhatsApp activity, restart, OAuth
change, push, merge, deployment or publication occurred.

The minimum next step is a separately approved V1.3 change that permits exactly
one diagnostic case in diagnostic mode while retaining exactly two cases for
scored mode, re-freezes the adapter and runner before execution, and then runs
the same single Hinglish fixture once. No scored or live run is authorized.
