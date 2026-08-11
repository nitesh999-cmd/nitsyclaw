# Qwen3-ASR V1.4 strict UTF-8 transport diagnostic

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `749cd5ab680815b16283af55774c6f3490773dc8`

Frozen launch commit: `20e75ea4599c2a74616ac20f264d5b9381b540a4`

## Transport diagnostic verdict

**PASS. Voice remains NO GO.**

Exactly one unchanged synthetic Hinglish case was submitted on fixed `cuda:0`.
The child loaded the pinned model, completed local inference, emitted native
multilingual JSON, exited cleanly and was parsed using strict UTF-8. No retry,
English case, scorer, scored smoke or ASR-quality assessment was performed.

## Proven repair

The V1.3 failure was first reproduced without the model. With both UTF-8 controls
absent, the same local Python runtime reported `cp1252`, exited `1` and raised
`UnicodeEncodeError` while printing Devanagari JSON with `ensure_ascii=False`.

V1.4 changes only the proven transport boundary:

- forces `PYTHONUTF8=1`
- forces `PYTHONIOENCODING=utf-8`
- restores the parent's prior values after the bounded child closes
- retains the existing fatal `TextDecoder("utf-8", { fatal: true })` parent path
- configures Python stdout and stderr as UTF-8 with strict errors
- preserves the frozen adapter's `json.dumps(..., ensure_ascii=False)`
- stores byte count, SHA-256 and base64 for exact successful stdout
- records only the two approved environment controls, never the full environment

The repaired non-model control reported `utf-8` / `strict`, emitted Devanagari,
Unicode punctuation, currency and supplementary Unicode, and exited `0`.

## Regression proof

The pre-inference V1.4 gate passed 58 tests across seven files. It covers:

- Devanagari Hindi, Roman Hinglish and mixed English/Devanagari
- Indian names and solar product names
- Unicode punctuation and currency symbols
- newlines, quotes, backslashes and JSON control characters
- supplementary Unicode characters
- fail-closed malformed UTF-8 and truncated multibyte output
- zero-byte stdout distinct from encoding failure
- non-zero exit with valid Unicode stderr
- no secret or full environment persistence
- exactly one diagnostic case and exactly two scored cases
- existing lifecycle, timeout, persistence and cleanup behaviour

## Frozen invocation and components

No-overwrite preflight evidence:
`docs/qwen3-asr-v14-hinglish-preflight-2026-08-11.json`

- Invocation SHA-256: `b43f73810e558c4446f6468ca7deb0282d5ecc892b33e492ddafe3a56ac9fa1a`
- Preflight SHA-256: `48f2e72dfa4ba07292f29681141d2e550e8bcd703701ce6dd8fbf419cb9f0d05`
- Static freeze SHA-256: `1999afaf6dff7b18721cfa530ebf23c136b09d4639ed7f5ececd6d099cc282a2`
- V1.4 aggregate: `5545f163e6af1ae262ea6cd522189a04d6df636dd760e48a800b7709dc976f1b`
- Parent V1.3 aggregate: `0f2c460dbf70b23b6193ba70ff3f3772dede0783ef78f3797d2e46fb55fedddb`
- Model revision: `7278e1e70fe206f11671096ffdd38061171dd6e5`
- Device / dtype: fixed `cuda:0` / `bfloat16`
- Timeout: `600,000 ms`, unchanged
- Mode: diagnostic; scorer authorization: false; retry authorization: false
- Fixture SHA-256: `c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c`
- Fixture bytes: `234,818`

| Frozen component | SHA-256 |
|---|---|
| Local speech synthesizer | `29d761810f13530d22104d94c1ba0730cb68fb688abce9d239d972abbe8fffd5` |
| SAPI synthesis script | `e83e9526f9f77f7ae2be38d68033319e81e30e83410b2d43d6470f2be4f5df78` |
| V1.4 Python adapter | `408cb7c1851259a292955f67b50e6dc3bada9434154b3bda9de775059b13fac0` |
| Frozen base adapter | `ee84c72ceaedf57946c6c12a66f7fac9977ece5d792fa6926a24b0c8c0ec69b8` |
| V1.4 environment wrapper | `cb9eb6236f20f73041a79457c5f50ee2e51903e9f03f6d0e0d3fcce23a93be23` |
| Frozen parent process telemetry | `d2e7cf2362a90e5e581c9d0ed7791f409050921a11f8bf2f30bf36fa44a9274f` |
| V1.4 single-case runner | `79d5663ec40e6d451b14c4b63dd59242a17dfb8e9ebac444ba1128e7530a331b` |
| Frozen voice fixture specification | `6e332da97775467c84006dbd2211822469a9ac941c0f2668d56fe76a452786b5` |

## Model inference and exact transport result

Model inference and JSON emission both completed.

Exact retained raw transcript:

> कल सुबह रवि को सिडनी में कॉल करना और टेस्ला पावरवुल थ्री का क्वोट 15 परसेंट डिस्काउंट के साथ चेक करना।

This transcript is reported as transport evidence only. It was not compared to
ground truth, scored or used to make any quality claim.

Raw stdout evidence:

- bytes: `1,510`
- SHA-256: `79484f337ef8345cebde913047301a8cb6265139fc07badc3a5504b3b27a8fa7`
- strict UTF-8 decode: PASS
- exact bytes retained: true
- parsed JSON SHA-256: `855e09ce8f5ec2867e8977a98ad8ee13f7be2bd411393fdcbad5db7e20b78f87`
- parsed transcript equals retained transcript: true

## Child lifecycle, latency, network and cleanup

Durable process evidence:
`docs/qwen3-asr-v14-fixed-cuda-0-hinglish-diagnostic-process-2026-08-11.json`

Process SHA-256:
`4d99a62bf1d7109f6e57ca7d3e7b316f5666b75a923729222b4e32474cfec53e`

| Field | V1.4 result |
|---|---|
| Process creation | `2026-08-11T10:11:32.218Z` |
| PID | `47112` |
| Spawn | succeeded at `2026-08-11T10:11:32.227Z` |
| Exit / close | code `0` at `2026-08-11T10:11:52.556Z` |
| Signal | none |
| Timeout / cancellation | false / false |
| Graceful / forced termination | false / false |
| Wall-clock duration | `20,416 ms` |
| Adapter elapsed | `19,240 ms` |
| Model load | `3,215 ms` |
| Case inference latency | `5,589 ms` |
| stdout | `1,510` bytes, complete strict UTF-8, not truncated |
| stderr | `545` bytes, complete strict UTF-8, not truncated |
| stderr SHA-256 | `2919c0a74cf354e7eddc2e9e453fd5f697e1dc996b6a2e8cd01765e7350f59af` |
| Transcript parse | `PARSED` |
| Classification | `SUCCESS` |
| Exact-PID non-loopback rows | `0` |
| Process cleanup | passed |
| Post-exit child / GPU row | absent / absent |
| Running record / private temp directory | absent / absent |

Stderr contained only model-loading progress and generation warnings already
captured in the sanitized process evidence; it contained no exception.

## RAM and VRAM limitations

- Adapter-reported peak process working set: `5,233,831,936` bytes. The external
  tasklist sampler remains known unreliable, so this is retained as adapter
  telemetry rather than independently corroborated host RAM proof.
- CUDA allocator peak allocated: `4,698,449,408` bytes.
- CUDA allocator peak reserved: `4,731,174,912` bytes.
- WDDM per-process VRAM remained unavailable. CUDA allocator counters are not a
  substitute for an independent WDDM measurement.
- Before JSON emission cleanup reported `9,568,256` CUDA bytes allocated and
  `3,456,106,496` reserved. The exact PID and GPU row were absent after exit,
  and system GPU usage fell from `2,507 MiB` to `2,300 MiB`.

## Host and network evidence

Machine-readable host evidence:
`docs/qwen3-asr-v14-host-evidence-2026-08-11.json`

- Python socket access was denied before third-party imports.
- Hugging Face and Transformers offline modes were forced.
- Exact-PID monitoring observed zero non-loopback connections.
- No kernel firewall rule was available; isolation remained application-enforced
  plus exact-PID monitoring.
- The process window contained zero Application/System events, Reliability
  Monitor records or new WER items.

## Verification

| Check | Result |
|---|---|
| V1.3 non-model `cp1252` reproduction | PASS — exit `1`, deterministic `UnicodeEncodeError` |
| V1.4 non-model UTF-8 control | PASS — UTF-8/strict, native multilingual JSON, exit `0` |
| Python V1.4 adapter syntax | PASS — isolated `ast.parse`, no adapter execution |
| V1.1 and V1.3 freeze verifiers | PASS — historical execution files unchanged |
| V1.4 freeze verifier | PASS before and after inference — aggregate `5545f163e6af1ae262ea6cd522189a04d6df636dd760e48a800b7709dc976f1b` |
| V1.4 runner compile-only check | PASS — temporary bundle removed without execution |
| Encoding, adapter and telemetry suite | PASS before and after inference — 7 files, 58 tests |
| Focused non-live voice suite | PASS — 10 files, 251 tests |
| Workspace typecheck | PASS — shared, bot and dashboard |
| Full lint | PASS — 0 errors, 5 pre-existing warnings |
| Focused Semgrep | PASS — 4 local rules, 3 targets, 0 findings; metrics off |
| Focused secret scan | PASS — 12 files, 8 pattern families, 0 findings |
| Raw-byte, strict-decode, schema and environment-privacy invariants | PASS |
| `git diff --check` | PASS |

No scorer test, scorer command, second child or additional model inference was
included in post-diagnostic verification.

## Scope and next action

No model, package, dependency, prompt, fixture, timeout, threshold, precision or
device changed. No download, network inference, WhatsApp activity, restart,
OAuth change, push, merge, deployment or publication occurred.

The next separate authorization may freeze and run exactly one scored two-case
Qwen smoke against the existing V2.1 scorer. Voice remains NO GO unless that
quality gate passes.
