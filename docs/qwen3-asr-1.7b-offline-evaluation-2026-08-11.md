# Qwen3-ASR 1.7B offline compatibility and two-case smoke evidence

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `3286158e5b7c4c9e7940daae3e4fed3e51a9c076`

Scope: official local model, synthetic audio only, no WhatsApp send or restart

## Verdict

**BLOCKED.** The official model and CUDA runtime passed integrity, import, full-GPU
load and cleanup checks, but the frozen scored child exited without a JSON result
before producing either transcript. The outer runner therefore had no English or
Hinglish raw output to score. It failed closed, removed the generated media, and
did not run the 216-clip gate.

The exact native child failure is not proven. Resource pressure is plausible but
is not recorded as the cause: system GPU use peaked at 7,496 MiB of 8,188 MiB,
there was no retained Windows crash event, and the frozen runner discarded the
child exit code and stderr when stdout was empty. That loss of child telemetry is
a proven observability defect. Under the frozen rules, a crash or absent result is
BLOCKED and cannot be repaired by WER, canonicalization, transliteration, or a
second unapproved scoring run.

Voice remains **NO GO**. There is no Qwen quality claim, no Hindi result, no live
voice authorization, and no 216-clip authorization.

## Official source and integrity

- Official code repository: `https://github.com/QwenLM/Qwen3-ASR`
- Reviewed upstream commit: `7c6daf77a2421100f5fb066495372c00129d39ff`
- Official model repository: `https://huggingface.co/Qwen/Qwen3-ASR-1.7B`
- Pinned model revision: `7278e1e70fe206f11671096ffdd38061171dd6e5`
- Licence: Apache-2.0; repository public and ungated
- Official manifest: 12 files, 4,703,114,308 bytes (4.380 GiB)
- Model config: `qwen3_asr`, architecture
  `Qwen3ASRForConditionalGeneration`, no `auto_map`, no repository Python files
- Weight format: safetensors only; no pickle or `.bin` weights

| File | Bytes | Official object hash | Verified |
|---|---:|---|---|
| `.gitattributes` | 1,519 | git blob SHA-1 `a6344aac8c09253b3b630fb776ae94478aa0275b` | yes |
| `README.md` | 57,456 | git blob SHA-1 `3a67d43f21febda213ff36efdb60ef10019af7f3` | yes |
| `chat_template.json` | 1,161 | git blob SHA-1 `c44736493efd71ec96218cc626904698cdb13235` | yes |
| `config.json` | 6,194 | git blob SHA-1 `2bc16c9d4ca08963715cfb94d879799b9adbd0e9` | yes |
| `generation_config.json` | 142 | git blob SHA-1 `7382a4d347c0a865b76bb1b8277f66a5ac312854` | yes |
| `merges.txt` | 1,671,853 | git blob SHA-1 `31349551d90c7606f325fe0f11bbb8bd5fa0d7c7` | yes |
| `model-00001-of-00002.safetensors` | 4,220,320,824 | SHA-256 `a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6` | yes |
| `model-00002-of-00002.safetensors` | 478,200,688 | SHA-256 `6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc` | yes |
| `model.safetensors.index.json` | 64,821 | git blob SHA-1 `1048a4eb4f21fef9aea06d8568a784b2b5595689` | yes |
| `preprocessor_config.json` | 330 | git blob SHA-1 `8f7f07346466d5d494ec0d4969d1c3d0190eed72` | yes |
| `tokenizer_config.json` | 12,487 | git blob SHA-1 `b93109843922a40c6654c5449d3bf95372267c66` | yes |
| `vocab.json` | 2,776,833 | git blob SHA-1 `4783fe10ac3adce15ac8f358ef5462739852c569` | yes |

All 12 official object hashes were checked after download and before model load.
No partial model file remained.

## Runtime bill of materials

The complete machine-readable 52-component BOM is in
`docs/qwen3-asr-runtime-bom-2026-08-11.json` (SHA-256
`e9371c468c66072254f589238995cb6749d532b95bacba6c6d7cf645b4e2e48f`).
It records CPython, pip, all 50 locked packages, artifact URLs, versions,
licences, exact artifact byte sizes, hashes, purposes and declared dependency
edges.

Key pins:

| Component | Version | Source/integrity | Purpose |
|---|---|---|---|
| CPython x64 | 3.12.10 | python.org installer, 26,964,224 bytes, SHA-256 `67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb`, valid PSF Authenticode and Sigstore digest | isolated interpreter |
| pip | 25.0.1 | bundled by official CPython installer | local installer only |
| qwen-asr | 0.0.6 | official PyPI wheel, 141,603 bytes, SHA-256 `b9c55a38413298f3a990a4475467399daec6e8f4172363053fc42e2166c2dfd3`, Apache-2.0 | official inference wrapper |
| torch | 2.9.1+cu128 | official PyTorch cu128 wheel, 2,862,033,275 bytes, SHA-256 `3a01f0b64c10a82d444d9fd06b3e8c567b1158b76b2764b8f51bfd8f535064b0` | CUDA runtime and inference |
| transformers | 4.57.6 | PyPI SHA-256 `4c9e9de11333ddfe5114bc872c9f370509198acf0b87a832a0ab9458e2bd0550` | model loader/processor |
| accelerate | 1.12.0 | PyPI SHA-256 `3e2091cd341423207e2f084a6654b1efcd250dc326f2a37d6dde446e07cabb11` | device placement |
| librosa | 0.11.0 | PyPI SHA-256 `0b6415c4fd68bff4c29288abe67c6d80b587e0e1e2cfb0aad23e4559504a7fa1` | local audio normalization |
| soundfile | 0.14.0 | PyPI SHA-256 `299491d3499460fb1b74bb4bd78b57ffc2d243a5fafa7b6ec1b264875c78453e` | PCM WAV decoding |

Pre-inference budget:

- Unique runtime downloads: 3,046,697,816 bytes
- Model downloads: 4,703,114,308 bytes
- Combined unique artifacts: 7,749,812,124 bytes (7.218 GiB)
- Hard ceiling fixed before runtime/model installation: 9,663,676,416 bytes (9 GiB)
- Free C: space at preflight: 1,087.98 GiB
- Final local footprint: 10,041,941,481 bytes (9.352 GiB), comprising the
  model, CPython runtime, virtual environment, verified installer and ignored
  local evaluation logs

The Node lockfile and dependency graph were unchanged. The project-local venv
contains 51 installed distributions: 50 exact lock matches plus bundled pip;
there are zero unexpected packages and zero version mismatches.

Qwen declares six packages that are deliberately absent from the minimal
offline inference surface: Flask, Gradio, pytz, qwen-omni-utils, sox and soynlp.
Static import tracing showed Flask/Gradio/pytz in demo/service entry points,
qwen-omni-utils outside this Transformers ASR path, sox outside local
soundfile/librosa decoding, and soynlp inside the unused Korean forced-alignment
branch. Forced alignment and timestamps are disabled. `pip check` therefore
returns 1 with exactly those six declared-but-intentionally-omitted packages;
the locked import path itself succeeds. This exception must not be copied into a
production distribution without a packaging/legal review.

All installed licences resolved. The model and Qwen package are Apache-2.0.
The pruned graph omits the standalone GPLv3 soynlp package. The installed graph
still contains permissive packages plus LGPL-2.1-or-later soxr and bundled
runtime notices/exceptions recorded in the BOM; local private evaluation is
permitted, while redistribution remains separately review-gated.

## Windows and GPU compatibility

- Windows 11 Pro 64-bit, build `10.0.26200`
- RAM: 63.1 GiB total; 31.77 GiB free at preflight
- GPU: NVIDIA GeForce RTX 4060, 8,188 MiB, compute capability 8.9
- Driver: 610.74
- PyTorch: CUDA available, bundled CUDA runtime 12.8
- No system CUDA toolkit, cuDNN, compiler, Python PATH, WSL or Docker change

Non-scored full-GPU initialization passed with bfloat16, `cuda:0`, batch size 1
and 128 maximum new tokens:

- Load time: 4.749 seconds
- Process RSS after load: 2,140,610,560 bytes
- CUDA peak allocated: 4,698,449,408 bytes
- CUDA peak reserved: 4,701,814,784 bytes
- System GPU use: 4,594 MiB baseline; 7,597 MiB observed maximum
- Cleanup: CUDA allocated 0, reserved 0
- TCP rows for the isolated process: 0

This proves the weights can load on this GPU. It does not prove scored inference
fits reliably: the scored run reached 7,496 MiB system GPU use and then produced
no result. No CPU-offload rerun was performed after the frozen scored failure.

## Frozen evaluation and quality result

The Qwen evaluation was frozen before candidate scoring at aggregate SHA-256
`d2c6244ffd544e343699266287f798f2d3ea98a312547dca42ecfa7d3454605d`.
It binds the adapter, bounded process wrapper, V2.1 candidate adapter, runner,
runtime locks, model revision/settings and evidence path. It also binds the
existing immutable scorer aggregates:

- V2 aggregate: `d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b`
- V2.1 aggregate: `fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5`

The two existing references were synthesized from scratch, converted to mono
16-bit 16 kHz PCM and passed only to the local adapter. The child opened zero
observed TCP rows. It exited without a JSON result; the outer run exited 1 and
removed its private temp directory.

| Case | Exact raw Qwen transcript | Frozen V2 score | Frozen V2.1 canonical fields | Verdict |
|---|---|---|---|---|
| `english-solar-au` | **none produced** | not scoreable | not scoreable | BLOCKED |
| `hinglish-business` | **none produced** | not scoreable | not scoreable | BLOCKED |

There are no Qwen WER, critical-entity, recipient, product, number, action,
intent, negation, language or latency scores. Hindi has no dedicated case in
this bounded two-case smoke and was not evaluated. No raw transcript exists to
preserve or compare. Missing confidence remains explicit (`null`); external
action permission remains false.

## Comparison with the frozen prior baseline

The prior Nemotron and Whisper numbers below are unchanged committed V2 evidence.

| Model/case | WER | Critical entities | Intent | Overall |
|---|---:|---:|---:|---|
| Nemotron 0.6B Q8 English | 0.267 | 0.667 | 1.000 | fail |
| Nemotron 0.6B Q8 Hinglish | 0.316 | 0.400 | 0.500 | fail |
| Whisper large-v3 English | 0.000 | 1.000 | 1.000 | pass |
| Whisper large-v3 Hinglish | 0.421 | 0.400 | 0.500 | fail |
| Qwen3-ASR 1.7B English | not produced | not produced | not produced | blocked |
| Qwen3-ASR 1.7B Hinglish | not produced | not produced | not produced | blocked |

Qwen cannot be ranked above or below either baseline from this run.

## Privacy and loading security

- Model path and audio paths must be absolute local paths under reviewed roots.
- `trust_remote_code=False` and `local_files_only=True` are explicit.
- Model config rejects `auto_map`; the weight index rejects every non-safetensor
  filename; both large weights are re-hashed inside the adapter before load.
- Python socket access is denied before third-party imports; Hugging Face and
  Transformers offline flags, telemetry opt-out and dead-loopback proxies are
  forced by both parent and child.
- A Windows Firewall program rule was attempted but access was denied; no rule
  was created. Network isolation is therefore application-enforced, not kernel-
  enforced. PID observation saw zero TCP rows during initialization and scoring.
- The Qwen utility package contains a generic URL audio loader, but the adapter
  accepts only reviewed local PCM WAV files and blocks sockets before import.
- Wheels were SHA-256 pinned and binary-only. Static inspection found no package
  post-install hook. The sole `.pth` file is setuptools'
  `distutils-precedence.pth` shim.
- No cloud ASR/TTS, OpenAI audio, model-repository code, customer recording,
  personal recording, WhatsApp process or recipient was used.

## Failure-path and verification evidence

| Check | Result |
|---|---|
| Qwen focused process/adapter/V2.1/freeze tests | PASS: 4 files, 17 tests |
| Frozen Qwen manifest verification | PASS: 6 files, aggregate matched |
| Non-scored model initialization | PASS; load, GPU and cleanup proven |
| Scored two-case smoke | BLOCKED: child returned no JSON; no transcript/score |
| Malformed WAV | PASS: structured validation error, exit 2, CUDA 0/0, temp removed |
| Timeout | PASS: bounded child terminated in deterministic test |
| Cancellation | PASS: bounded child terminated in deterministic test |
| Partial/empty/multiple JSON | PASS: rejected in deterministic tests |
| Output flooding | PASS: child terminated at output limit |
| OOM result handling | PASS in structured/static regression; actual scored exit cause unproven |
| Focused voice Semgrep | PASS: 4 rules, 4 files, 0 findings |
| Complete non-live voice suite | PASS: 10 files, 251 tests |
| WhatsApp non-live release gate | PASS: receipt 167, smoke 299, registry 171, reply 26; no sends |
| Complete unit/integration suite | PASS: 230 files, 1,279 tests |
| Workspace typecheck | PASS: shared, bot, dashboard |
| Focused runner strict typecheck | PASS |
| Lint | PASS: 0 errors; 5 pre-existing warnings |
| Production build | PASS: bot and dashboard |
| Python lock inspection | PASS: 50/50 locked, no mismatch/unexpected package |
| Python `pip check` | EXPECTED NONZERO: six intentionally omitted non-runtime declarations listed above |
| Node dependency audit | FAIL: existing 38 advisories (25 high, 13 moderate); no dependency change authorized |
| Node lockfile change | PASS: none |
| Secret scan of every changed/new file | PASS: 0 secret-shaped findings |
| Generated model/audio/runtime tracking check | PASS: 0 trackable artifacts |
| `git diff --check` | PASS |
| Agent Reach update check | PASS: v1.5.0 is current |

## Failed-run cause and next architecture choice

The only exact cause proved for the missing verdict is the telemetry gap: on
empty stdout, the frozen process wrapper throws while discarding the child exit
code and stderr. The lower-level reason the child emitted nothing is unproven.
A new evaluation must first capture those values durably and, if the exit is
confirmed as GPU OOM, freeze Qwen's documented same-model CPU-offload placement
before any new scoring.

An independent local verifier is the safer future architecture: primary ASR and
a different local model must independently agree on every recipient, name,
date, amount, product, number, action and negation, followed by owner read-back.
It costs more latency and memory but reduces correlated transcription risk. An
English-only guarded preview is lower effort, but is not justified here because
Qwen produced no English transcript and Whisper is the only existing English
case pass. Recommendation: diagnose and re-freeze the same Qwen model first;
then prefer an independent verifier over a Qwen English-only preview. Neither
option permits live WhatsApp use without the full voice/security gates.

## Rollback

Run the verified CPython installer uninstall first, while the ignored installer
still exists, then remove only the three exact evaluation roots:

```powershell
$installer = 'C:\Users\Nitesh\projects\NitsyClaw\.qwen3-asr\downloads\python-3.12.10-amd64.exe'
$runtime = 'C:\Users\Nitesh\AppData\Local\NitsyClaw\qwen3-asr\python-3.12.10'
$model = 'C:\Users\Nitesh\AppData\Local\NitsyClaw\models\Qwen3-ASR-1.7B\7278e1e70fe206f11671096ffdd38061171dd6e5'
$localEvaluation = 'C:\Users\Nitesh\projects\NitsyClaw\.qwen3-asr'
Start-Process -FilePath $installer -ArgumentList @('/quiet', '/uninstall', 'InstallAllUsers=0', "TargetDir=$runtime") -Wait -WindowStyle Hidden
Remove-Item -LiteralPath $model -Recurse -Force
Remove-Item -LiteralPath $localEvaluation -Recurse -Force
```

Do not run `pip cache purge`: the user cache is shared with unrelated Python
work. The verified PyTorch HTTP cache body is at
`C:\Users\Nitesh\AppData\Local\pip\cache\http-v2\3\e\0\8\d\3e08d0da05a1ae8f91e9402193976a7c87a54e1a58e37c552d053344.body`,
but its removal is intentionally left for a separate cache-specific approval.

## Exact next action

Approve a new **Qwen smoke V1.1 diagnostic re-freeze** limited to durable child
exit/stderr capture and, only if OOM is proven, the official same-model
`device_map="auto"` CPU-offload mode. Then rerun the same two synthetic clips
once. Do not build the 216-clip gate and do not run any live WhatsApp test until
that re-frozen smoke passes every safety field.
