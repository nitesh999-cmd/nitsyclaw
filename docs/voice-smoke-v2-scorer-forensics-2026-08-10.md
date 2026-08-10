# Offline voice smoke V2 scorer forensics - 10 August 2026

## Decision

**FAIL.** The frozen V2 scorer corrected the known Whisper English formatting
penalty, but both already-installed models still failed at least one
safety-critical smoke case. `NITSYCLAW-VOICE-EVAL-v1` was not constructed and
the 216-clip gate remains blocked. Voice remains **NO GO**.

No WhatsApp message or restart, personal/customer recording, download, cloud
inference, dependency change, deployment, push, merge, publication, or OAuth
change occurred.

## State and frozen artifacts

- Repository: `C:\Users\Nitesh\projects\NitsyClaw`
- Branch: `codex/whatsapp-voice-intelligence`
- Starting commit: `dfa767d226d6cb6298f0c6da23c7f4d60fc1109f`
- Relevant tracked worktree at start: clean
- Frozen schema: `NITSYCLAW-VOICE-SMOKE-V2`
- Scorer SHA-256: `59cd6c7690a48e346b0a088390466bcd44d3843f63a70385f7159e4c66b16969`
- Specification/fixture SHA-256: `6e332da97775467c84006dbd2211822469a9ac941c0f2668d56fe76a452786b5`
- Aggregate freeze SHA-256: `d169f8584a158af92463bf84ad7afa257d2daeb5d2ed13d4df3b585e28115d7b`

The final hash was recorded and verified before the official candidate rerun.
After that final freeze, the scoring implementation, thresholds, canonical
cases, positive fixtures, and adversarial fixtures were not changed.

One safety-only self-audit correction occurred before the final freeze and
official rerun. The preliminary aggregate freeze
`20ad797f832edc9103510561eea79ced8db21a1403c7beca9b67f9579092e1f1`
failed to detect apostrophized negations such as `don't`. The fix recognizes a
closed set of common negative contractions and adds five regression cases. It
cannot improve either observed candidate transcript, changes no threshold or
equivalence, and only makes the safety channel stricter. The candidate-benefiting
joined-`PM` omission remained unchanged. Both models were rerun only after the
final aggregate above was recorded.

## Exact V1 defect and causal proof

V1 lowercased NFKC text, replaced every non-letter/non-number run with a space,
and then used literal-token Levenshtein distance and a literal word-set entity
check. It had no typed values and no independent intent, negation, script, or
safety channel.

For the committed Whisper English evidence:

- reference tokens: 19
- actual tokens: 15
- Levenshtein edits: 6
- WER: `6 / 19 = 0.315789...`, reported as `0.316`
- literal entities present: `raj`, `sharma`, `melbourne`, `fronius`
- literal entities absent: `three`, `thirty`, `ten`, `kilowatt`
- entity accuracy: `4 / 8 = 0.500`

The deterministic V1 alignment accounts for all six edits as:

1. delete `three`
2. delete `thirty`
3. substitute `p` with `3`
4. substitute `m` with `30pm`
5. delete `ten`
6. substitute `kilowatt` with `10kw`

This proves that `3.30pm` and `10kW` were penalized because punctuation was
discarded without typed time/unit reconstruction. The committed Whisper
Hinglish evidence also reproduces exactly: 21 reference tokens, 28 edits, WER
`1.333`, and zero of seven literal Roman-script entity words. That case is not a
formatting-only failure: `Ravi` became `रवे`, Powerwall was damaged, and the
quote/action wording was missing. The previous V1 evidence file was left
unchanged.

The historical Nemotron V1 record preserved aggregate scores but not its raw
transcripts, so its old per-token alignment cannot be reconstructed without
inventing evidence. V2 now preserves raw synthetic transcripts explicitly.

## V2 channels and equivalence boundary

V2 keeps raw transcript, lexical WER, typed critical entities, intent,
negation/correction, language/script, and safety verdict as separate channels.
The safety verdict requires every critical entity and intent plus the exact
negation state; aggregate WER can never override it.

Examples proved equal before model execution:

- `fifteen` = `15`, but not `fifty`
- `three thirty P M` = `3.30pm`
- `ten kilowatt` = `10 kW`, but not `10 kWh`
- `15 August 2026` = `15/08/2026`, but not `08/09/2026`
- `AUD $1,250.50` = `1250.50 Australian dollars`, with sign preserved
- `+61 412 345 678` = `0412 345 678`, with every digit preserved
- `Fronius SH8RS` = `Fronius SH-8RS`, but not `SH10RS`
- exact correct `Ravi`/`रवि` forms map to one declared identity; mixed-script
  `Rаvi` containing Cyrillic `а` does not

The pre-run corpus contained 21 typed equivalence/inequivalence fixtures, two
positive end-to-end safety fixtures, 12 adversarial transcripts, 40 declared
entity/intent reject mutations, and 186 generated critical-number mutations.
All passed before the scorer was frozen. No fuzzy, phonetic, edit-distance, or
automatic critical-entity transliteration is used.

## Identical synthetic audio corpus

Each fixed prompt was synthesized once, converted to 16 kHz mono PCM once, and
the identical WAV was supplied to both models:

| Case | WAV SHA-256 | Bytes |
|---|---|---:|
| `english-solar-au` | `235c7e915a50123a5ba9e10ed32070186407a38b64bf08bf3b242f58961f2f5a` | 220,416 |
| `hinglish-business` | `c46218063f37892bdec79afe09c9353cec2396bafa9ffba527ba33951949c01c` | 234,818 |

All child processes had Hugging Face/Transformers offline flags, telemetry
disabled, and loopback-deny proxy variables. This was not a kernel-enforced
network sandbox, so the evidence is limited to local inputs/models and the
forced-offline process configuration.

## Local model integrity

| Model | Exact local bytes | SHA-256 |
|---|---:|---|
| Nemotron 3.5 ASR 0.6B Q8 | 751,094,240 | `b94545b313b3223fda7b2857a52681da813935c2127643d1e9ff0c23d988089c` |
| Whisper large-v3 | 3,095,033,483 | `64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2` |

Both were already installed. The runner verified both hashes from local files
before invoking Handy.

## Raw and V2-normalized scorecard

| Model/case | V2 WER | Lexical gate | Critical entities | Intent | Negation | Language/script | Latency | Safety |
|---|---:|---|---:|---:|---|---|---:|---|
| Nemotron English | 0.267 | fail | 0.667 | 1.000 | pass | English/Latin pass | 1,132 ms | fail |
| Nemotron Hinglish | 0.316 | pass | 0.400 | 0.500 | pass | Hinglish/Devanagari pass | 1,073 ms | fail |
| Whisper English | 0.000 | pass | 1.000 | 1.000 | pass | English/Latin pass | 6,482 ms | pass |
| Whisper Hinglish | 0.421 | fail | 0.400 | 0.500 | pass | Hinglish/Devanagari pass | 3,681 ms | fail |

### Nemotron English

Raw: `Please call Raj Sharma in Melbourne tomorrow at three thirty PM about the ten kilowatt fronias solar inverter.`

V2 lexical actual:
`please call raj sharma in melbourne tomorrow at three thirty pm about the power_kw_10 fronias solar inverter`

Genuine error: `Fronius` became `fronias`. The frozen fixture also omitted the
joined-meridiem spelling `three thirty PM` while listing spaced `P M`; this is a
conservative scorer false negative for the time channel. It was preserved rather
than repaired after output was seen. The genuine Fronius error independently
keeps the safety result failed.

### Nemotron Hinglish

Raw: `कल सुबह रवि को सिडनी में कॉल करना ऑयल टेसला पावर थ्री का फिफ्टीन परसेंट डिस्काउंट के साथ चेक करना`

V2 lexical actual:
`kal subah ravi ko sydney mein call karna ऑयल टेसला पावर थ्री ka फिफ्टीन परसेंट discount ke saath check karna`

Genuine errors: `aur` became `ऑयल`; Tesla became `टेसला`; Powerwall 3 became
`पावर थ्री` with `wall` omitted; and the quote word/quote-check intent was
omitted. `फिफ्टीन परसेंट` was not one of the frozen exact percentage forms, so
the typed discount channel failed closed rather than accepting an unreviewed
post-result transliteration.

### Whisper large-v3 English

Raw: `Please call Raj Sharma in Melbourne tomorrow at 3.30pm about the 10kW Fronius solar inverter.`

V2 lexical actual equals the V2 reference exactly:
`please call raj sharma in melbourne tomorrow at time_15_30 about the power_kw_10 fronius solar inverter`

All six critical entities, call intent, negation state, language, script,
latency, and lexical threshold passed.

### Whisper large-v3 Hinglish

Raw: `कल सुबह रवे को सिडनी में कॉल कना और टेसला पववल 3 का 15% डिसकाउंट के साथ चेक कना`

V2 lexical actual:
`kal subah रवे ko sydney mein call कना aur टेसला पववल 3 ka percent_15 डिसकाउंट ke saath check कना`

Genuine errors: Ravi became `रवे`; both instances of `karna` became `कना`;
Tesla became `टेसला`; Powerwall 3 became `पववल 3`; and the quote word/quote-check
intent was omitted. Location and exact 15 percent passed. Critical entities were
2/5, intents were 1/2, and WER `8/19 = 0.421`, above the unchanged 0.40 limit.

## Confidence, cleanup, and release boundary

Handy 0.9.4 returned no calibrated provider probability. `providerConfidence`
remained `null`; V2 marks every external action as requiring explicit owner
confirmation and never manufactures confidence.

Temporary SAPI, Ogg, and WAV artifacts were removed and the before/after temp
inventory matched exactly. Handy was not restarted and its UI-selected model was
not changed by the CLI runs.

Because both models failed safety-critical criteria, the mandatory stop rule
applies: no 216-clip gate and no live WhatsApp voice recommendation.

## Verification results

| Check | Result |
|---|---|
| V2 scorer, adversarial, mutation, and freeze tests | pass - 2 files, 19 tests |
| Complete voice suite | pass - 10 files, 251 tests |
| Non-live WhatsApp release gate | pass - no send/restart/provider mutation |
| Complete unit/integration suite | pass - 224 files, 1,249 tests |
| Workspace typecheck | pass - shared, bot, dashboard |
| Lint | pass - 0 errors; 5 pre-existing warnings |
| Production build | pass - bot and dashboard |
| Focused local-only Semgrep | pass - 4 rules, 6 TypeScript targets, 0 findings; metrics off |
| Focused secret scan | pass - 12 changed files, 8 credential patterns, 0 hits |
| V2 freeze verification after model run | pass - aggregate hash unchanged |
| Temporary artifact cleanup | pass - before/after inventory identical |

The model-quality command exited with status 1 by design because the frozen
aggregate result was `passed: false`. This is the release-quality failure being
reported, not an incomplete run.
