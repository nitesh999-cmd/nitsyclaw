# Voice smoke V2.1 held-out scorer evidence — 2026-08-10

## Verdict

PASS for the scorer-only V2.1 held-out validation stage. This is not an ASR
quality pass and does not authorize the 216-clip gate or a live WhatsApp test.

No ASR model was selected, loaded or run. No model or software was downloaded,
no network service was used for scoring, and no WhatsApp process was restarted
or sent a message.

## Held-out methodology

The specification and synthetic fixture corpus were authored from the sixteen
owner-approved coverage categories before scorer execution. They use new
synthetic recipients, Australian locations, solar brands, dates, numbers and
command shapes. No Nemotron or Whisper transcript was used to create a passing
fixture. `SH8RS`/`SH10RS` and Powerwall 2/3 occur only because the owner
explicitly required those collision pairs.

The fixture and specification hashes remained unchanged after the first scorer
execution. Only proven scorer/harness defects were corrected. The corpus keeps
lexical equivalence separate from typed critical fields; transliteration never
repairs a recipient, action, location, product or model.

## Freeze evidence

Committed V2 was reproduced before V2.1 work:

- V2 scorer SHA-256: `59cd6c7690a48e346b0a088390466bcd44d3843f63a70385f7159e4c66b16969`
- V2 specification SHA-256: `6e332da97775467c84006dbd2211822469a9ac941c0f2668d56fe76a452786b5`
- V2 aggregate SHA-256: `d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b`
- V2 reproduction tests: 2 files, 19 tests passed

Final V2.1 freeze:

- specification SHA-256: `ff15ab8cfdff3a049d4d71102b2dceef51bceec9e694b37f12eaf8feb03b9bd1`
- held-out fixture corpus SHA-256: `ccf17ac2f80a179ea11aced0873ddd4952a2967662955fd7b0a609d1669a0c3f`
- scorer SHA-256: `945c1d3119d39e14514ef0d78f5b38de037c440b1dca26baccb3bf8cd5e382fb`
- aggregate SHA-256: `fba510500f928675905d67e838caecd9b1075d708c96938d5249fc8d873820a5`

The freeze verifier hashes canonical LF text, permits only the three declared
paths and rejects file, path or aggregate drift.

## Results

| Area | Result |
|---|---:|
| Positive held-out fixtures | 35/35 pass |
| Negative held-out fixtures | 72/72 reject |
| Typed positive equivalence | 25/25 pass |
| Typed negative collisions | 30/30 reject |
| Lexical positive equivalence | 6/6 pass |
| Lexical negative changes | 6/6 reject |
| Complete command safety fixtures | 28/28 correct |
| Explicit typed mutations | 59/59 reject |
| Generated typed mutations | 1,476/1,476 reject |
| Combined critical-entity mutation rejection | 1,535/1,535 (100%) |
| Unicode/confusable attacks | 12/12 reject |

The generated mutations cover every declared critical type across values,
dates, times, timezones, currency, percentages, phone numbers, power, energy,
recipients, actions, locations, products and models. Repeated audits were
byte-identical under UTC/en-US, Australia/Sydney/en-AU and
Asia/Kolkata/hi-IN host settings.

Roman/Devanagari mappings passed only in the declared general lexical channel.
The same name across scripts remained unequal as a recipient. Mixed Latin and
Cyrillic identities, zero-width controls, bidirectional controls, full-width
model digits and product homoglyphs all failed closed.

Direct harmless commands passed 4/4. Changed action, inserted action, missing
critical word, changed recipient, quoted command, background speech and
explicit non-action fixtures all rejected. Plain negation, apostrophized
negation, double negation and correction phrases were independently classified;
all ambiguous or negative cases blocked external action.

## Defects discovered and repaired

1. The first freeze manifest used an incorrectly constructed aggregate hash.
   The verifier rejected it before any scorer test ran. Only the aggregate
   bookkeeping value was corrected; the three individual frozen files did not
   change.
2. The initial manifest validator required IDs to be globally unique even when
   separate typed, mutation and Unicode namespaces intentionally reused a
   descriptive ID. No safety verdict ran past this guard. Validation now
   enforces uniqueness inside each namespace; corpus and thresholds did not
   change.
3. The held-out spoken-year fixture proved `twenty twenty-six` was parsed as
   2006 rather than 2026. The deterministic year composition was corrected.
   The specification, fixture corpus and thresholds remained byte-identical.

No candidate-specific vocabulary exception was added.

## Threshold proof

Typed critical-field accuracy, mutation rejection, Unicode rejection, intent
accuracy and negation/context accuracy remain fixed at `1.0`. Missing provider
confidence still requires explicit owner confirmation. WER cannot override a
critical-field or action-safety failure. The V1 and V2 files and evidence were
not modified.

## Verification

| Check | Result |
|---|---|
| Final V2.1 freeze verifier | pass |
| Focused V2.1 scorer/freeze tests | pass — 2 files, 13 tests |
| V2.1 deterministic audit | pass — all 107 fixed fixtures and 1,535 mutations |
| Complete voice suite | pass — 10 files, 251 tests |
| Non-live WhatsApp release gate | pass — no send, restart or provider mutation |
| Complete unit/integration suite | pass — 226 files, 1,262 tests |
| Workspace typecheck | pass — shared, bot and dashboard |
| Lint | pass — 0 errors, 5 pre-existing warnings |
| Production build | pass — bot and dashboard |
| Focused local-only Semgrep | pass — 4 rules, 5 TypeScript targets, 0 findings; metrics off |
| Focused secret scan | pass — 9 files, 8 credential patterns, 0 hits |
| Git diff check | pass |

One unrelated PDF fallback test exceeded its five-second timeout when the full
suite ran concurrently with typecheck and lint. The exact test then passed alone
(263 ms), and the complete suite passed standalone. No unrelated test or timeout
was changed.

## Ranked next decision

1. **A — Qwen3-ASR evaluation.** Highest-leverage next model-blind offline
   comparison against the frozen scorer and synthetic evidence.
2. **B — independent Hindi/Hinglish verifier.** Valuable as a second safety
   channel after a primary ASR candidate proves adequate, not a substitute for
   primary recognition quality.
3. **C — English-only guarded preview.** Premature while Hindi/Hinglish is a
   stated product requirement and confidence telemetry is absent.
4. **D — stop voice development.** Appropriate only if another bounded local
   model evaluation is not approved or fails the frozen gates.

Exact next authorization command:

`APPROVE QWEN3-ASR OFFLINE EVALUATION — official model only, frozen V2.1 scorer, synthetic audio only, no WhatsApp sends.`
