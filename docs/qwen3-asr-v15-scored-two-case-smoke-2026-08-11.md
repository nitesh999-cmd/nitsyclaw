# Qwen3-ASR V1.5 scored two-case smoke

Date: 2026-08-11 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `332b529d5de8d9fb3bb9fa32d3ffc5fc9b78ccca`

Pre-inference freeze commit: `b3eede11f7e2d4ac029e4886882f5e3fdd61a95c`

## Decision

**FAIL. Voice remains NO GO.**

Exactly one bounded Qwen3-ASR-1.7B child ran on fixed `cuda:0`. It received
exactly two frozen synthetic cases in the required order: English first,
Hinglish second. The child completed both inferences, emitted strict UTF-8 JSON,
exited `0`, and was scored once after exit with the unchanged frozen V2/V2.1
scorer. No diagnostic child, retry, second attempt, WhatsApp activity, download,
dependency change, cloud inference, push, merge, deployment, OAuth change, or
personal/customer recording occurred.

The run fails because both cases violate the frozen scorer. Some English
failures are conservative surface-form omissions in the frozen scorer rather
than wrong semantic values. The Hinglish case also contains genuine product and
quote-form substitutions. Nothing was normalized, repaired, transliterated, or
re-scored after observing the outputs.

## Exact raw transcripts

### English

> Please call Raj Sharma in Melbourne tomorrow at 3:30 p.m. about the 10 kilowatt Fronius solar inverter.

### Hinglish

> कल सुबह रवि को सिडनी में कॉल करना और टेस्ला पावरवुल थ्री का क्वोट 15 परसेंट डिस्काउंट के साथ चेक करना।

## Frozen scorecard

| Case | WER | Lexical gate | V2 critical entities | Intent | Negation/correction | Language/script | Final V2.1 safety |
|---|---:|---|---:|---:|---|---|---|
| English | `0.266667` | fail (`<=0.20`) | `4/6` (`0.666667`) | `1/1` | pass; absent / no correction | English / Latin pass | fail |
| Hinglish | `0.263158` | pass (`<=0.40`) | `3/5` (`0.600000`) | `1/2` | pass; absent / no correction | Hinglish / Devanagari pass | fail |

### English normalized lexical representation

Reference:

`please call raj sharma in melbourne tomorrow at time_15_30 about the power_kw_10 fronius solar inverter`

Observed:

`please call raj sharma in melbourne tomorrow at 3:30 p.m about the 10 kilowatt fronius solar inverter`

English field results:

| Field | Expected | Observed | Result | Classification |
|---|---|---|---|---|
| Recipient | Raj Sharma | Raj Sharma | pass | exact approved form |
| Action / intent | call | call | pass | direct affirmative call |
| Location | Melbourne | Melbourne | pass | exact approved form |
| Date | tomorrow | tomorrow | pass | exact approved relative date |
| Time | 15:30 | `3:30 p.m.` | fail | semantically correct value, but this punctuation form is absent from the immutable surface forms |
| Power / number | 10 kW | `10 kilowatt` | fail | semantically correct value/unit, but this mixed numeric-word form is absent from the immutable surface forms |
| Product / brand | Fronius solar inverter | Fronius solar inverter | pass for frozen brand | no exact model number exists in this fixture |
| Amount / percentage | not applicable | not present | not applicable | no frozen field |
| Negation / correction | absent / absent | absent / absent | pass | direct affirmative context |

There was no wrong recipient, date, location, power value, unit, brand, or
action in the raw English transcript. The immutable scorer nevertheless rejects
time and power and records four lexical edits because it recognizes `3:30 pm`,
`3.30pm`, `15:30`, `ten kilowatt`, or `10 kW`, but not the two observed mixed
surface forms. The frozen rules were deliberately not changed after the result.

### Hinglish normalized lexical representation

Reference:

`kal subah ravi ko sydney mein call karna aur tesla powerwall_3 ka quote percent_15 discount ke saath check karna`

Observed:

`kal subah ravi ko sydney mein call karna aur tesla पावरवुल थ्री ka क्वोट 15 परसेंट discount ke saath check karna`

Hinglish field results:

| Field | Expected | Observed | V2 result | Final V2.1 result / classification |
|---|---|---|---|---|
| Recipient | Ravi | रवि | pass | fail: no automatic cross-script transliteration; observed canonical remains `रवि`, expected `ravi` |
| Action | call | कॉल | pass | pass as frozen exact action form |
| Quote-check intent | check quote with 15% discount | `क्वोट 15 परसेंट ... चेक` | fail | quote/percentage surface sequence is not an approved exact form |
| Location | Sydney | सिडनी | pass | fail: no automatic cross-script transliteration; observed canonical remains `सिडनी`, expected `sydney` |
| Brand | Tesla | टेस्ला | pass | fail: no automatic cross-script transliteration; observed canonical remains `टेस्ला`, expected `TESLA` |
| Product / exact model | Tesla Powerwall 3 | `टेस्ला पावरवुल थ्री` | fail | genuine `पावरवॉल` -> `पावरवुल` substitution plus unapproved `थ्री` surface form |
| Date/time | Kal subah | कल सुबह | retained lexically | no standalone typed date/time field exists for this frozen Hinglish case |
| Percentage / number | 15 percent | `15 परसेंट` | fail | numeric value appears correct, but `परसेंट` is not an approved frozen percentage form |
| Amount | not applicable | not present | not applicable | no frozen field |
| Negation / correction | absent / absent | absent / absent | pass | direct affirmative context |

No conflicting or inserted recipient, location, model number, percentage, action,
negation, or correction was observed. The critical failures are missing approved
forms/canonical matches, including the genuine Powerwall and quote substitutions.
The passing `0.263158` mixed-language error rate cannot override them.

## Qwen versus Whisper versus Nemotron

The Whisper and Nemotron values below are the committed V2 scorecard from the
same two frozen WAV files. Qwen uses the same immutable V2/V2.1 scoring boundary.

| Model / case | WER | Lexical | V2 critical entities | Intent | Latency | Safety |
|---|---:|---|---:|---:|---:|---|
| Nemotron English | `0.267` | fail | `0.667` | `1.000` | `1,132 ms` | fail |
| Whisper large-v3 English | `0.000` | pass | `1.000` | `1.000` | `6,482 ms` | pass |
| Qwen3-ASR 1.7B English | `0.267` | fail | `0.667` | `1.000` | `3,195 ms` | fail |
| Nemotron Hinglish | `0.316` | pass | `0.400` | `0.500` | `1,073 ms` | fail |
| Whisper large-v3 Hinglish | `0.421` | fail | `0.400` | `0.500` | `3,681 ms` | fail |
| Qwen3-ASR 1.7B Hinglish | `0.263` | pass | `0.600` | `0.500` | `4,776 ms` | fail |

Qwen has the best Hinglish WER and V2 entity rate of these three smoke results,
but it still fails exact product, percentage, quote intent, and V2.1 cross-script
safety. Whisper remains the only English smoke pass. None passes both cases, so
none is eligible for the 216-clip gate as a standalone action-authorizing ASR.

## Confidence and product behaviour

Qwen ASR `0.0.6` exposes no calibrated confidence in this path.
`providerConfidence` remained `null` at the payload and both case levels. No
confidence value was manufactured. Every external action remains blocked behind
explicit owner confirmation, and self-generated text cannot be treated as
verified recipient, date, amount, product, or instruction evidence.

## Lifecycle, resources, network and cleanup

| Field | Evidence |
|---|---|
| Model child count / retries | `1 / 0` |
| PID | `44080` |
| Process creation | `2026-08-11T10:39:26.306Z` |
| Spawn | succeeded at `2026-08-11T10:39:26.320Z` |
| Exit / close | code `0` at `2026-08-11T10:39:50.184Z` |
| Signal / timeout / cancellation | none / false / false |
| Graceful / forced termination | false / false |
| Wall clock | `24,164 ms` |
| Adapter elapsed / model load | `22,615 ms / 3,736 ms` |
| English / Hinglish inference | `3,195 ms / 4,776 ms` |
| stdout | `1,737` bytes; strict UTF-8 pass; exact bytes retained; SHA-256 `ff5af81a3bab148027def3c04674bb5796c382cd9407f6a91dcdd210d67a5591` |
| stderr | `619` bytes; strict UTF-8; model-loading/generation warnings only; no exception |
| Transcript parse | `PARSED`; no truncation |
| Exact-PID network samples | `25`; maximum non-loopback established connections `0` |
| Python network control | socket access denied before third-party imports; HF/Transformers forced offline |
| Kernel network control | unavailable; application enforcement plus exact-PID monitoring only |
| Temp cleanup | private evaluation directory removed; before/after temp inventory empty |
| Post-exit cleanup | exact PID absent; GPU compute row absent; `.running` marker absent |

Resource evidence:

- Adapter-reported peak process working set: `5,233,991,680` bytes. The Windows
  `tasklist` sampler is known to be unreliable, so this is not independent host
  RAM proof.
- Adapter process working set at result construction: `2,251,522,048` bytes.
- CUDA peak allocated: `4,698,449,408` bytes.
- CUDA peak reserved: `4,731,174,912` bytes.
- Pre-exit adapter cleanup reported `9,568,256` allocated and `3,456,106,496`
  reserved bytes; the exact process and GPU row were absent after exit.
- WDDM per-process VRAM remained unavailable. CUDA allocator counters are not an
  independent WDDM measurement.

## Frozen identities and evidence hashes

| Artifact | SHA-256 |
|---|---|
| V1.5 aggregate | `5269ce0fe5789913ba79febe83ff795924bdbe69e287f744c0f12cc0d9305570` |
| V1.4 parent aggregate | `5545f163e6af1ae262ea6cd522189a04d6df636dd760e48a800b7709dc976f1b` |
| Frozen V2 aggregate | `d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b` |
| Frozen V2.1 aggregate | `fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5` |
| Static freeze file | `e6bb659c41880b70a996109e8ed879a31fd59707630b79fed521f5ab0b97c01e` |
| Frozen invocation | `408256a9656f8c6d639ad62f6eb5664969a372b20fdf1baaff56badd5e88f7c9` |
| Preflight evidence | `9ffee7bc052e83066f0313b1e4f3dab4ff946fb687d147583e910c77faec3806` |
| Process evidence | `c11494d1b289f782bc2565b51591b9e27b41aafeb35ac54eb510c47a738e44fe` |
| UTF-8 transport evidence | `0c87f1998e9bde75da9dc768067e4e3c7ca16e4ae95ade311b06ffeafbac664c` |
| Scored result evidence | `ed6be2afd6165f8cd4fdd61d644106a1f1be0426aa37cd9cdbb3fda2deb8d425` |

Model revision: `7278e1e70fe206f11671096ffdd38061171dd6e5`

Model bytes: `4,703,114,308` across exactly 12 files

Weight 1: `a4cd1f1a04d90b757dc7f7dd26254e69a013b19e80efe590a83c6a3bde8608d6`

Weight 2: `6e0b9d9e09e2e0238e7ef3cc8a484ab387e91b90f1900bedf88bc92d7929ccfc`

Fixture identities:

- English: `235c7e915a50123a5ba9e10ed32070186407a38b64bf08bf3b242f58961f2f5a`, `220,416` bytes.
- Hinglish: `c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c`, `234,818` bytes.

## Verification

| Check | Result |
|---|---|
| V1.5 freeze verifier | pass before and after inference |
| V2.1 freeze verifier and held-out invariants | pass; 35/35 positive, 72/72 negative, 1,535/1,535 explicit/generated mutations, 12/12 Unicode |
| Pre-inference transport/scorer set | pass; 5 files, 29 tests |
| Encoding, adapter and process telemetry set | pass; 10 files, 71 tests before and after inference |
| Focused voice suite | pass; 10 files, 251 tests |
| Non-live WhatsApp release gate | pass; no send/restart/provider mutation |
| Complete unit/integration suite, default parallel pool | non-terminal: 234 files / 1,326 tests passed, then 2 Vitest workers exited unexpectedly |
| Complete unit/integration suite, serial confirmation | pass; 236 files, 1,333 tests |
| Workspace typecheck | pass; shared, bot and dashboard |
| Lint | pass; 0 errors, 5 pre-existing warnings |
| Production build | pass; bot and Next.js dashboard |
| Focused Semgrep | pass; 4 local rules, 6 targets, 0 findings; metrics/version check off |
| Focused secret scan | pass; 8 files, 8 pattern families, 0 findings |
| Dependency inspection | pass; package manifests/lockfile unchanged, local graph lists 51 packages across 4 projects, Python inventory exactly matches freeze |
| Cleanup/network evidence | pass within stated application-enforcement and telemetry limits |
| `git diff --check` | pass |

The parallel Vitest worker exits are retained as a test-runner/resource
observation. The serial complete run covered two additional files and completed
with no assertion or worker error.

## Scope and next action

No 216-clip gate and no live WhatsApp voice test is authorized. The next safe
step is a separately authorized, model-blind evaluation of an independent
Hindi/Hinglish critical-entity verifier or a guarded English-only architecture.
