# Voice Verifier V1 implementation evidence — 2026-08-12

## Verdict

PASS for the bounded deterministic verifier implementation. Voice release remains
NO GO. This work does not establish ASR quality, run the 216-clip gate, authorize
an external action, or provide live WhatsApp evidence.

## Frozen boundary

The specification and synthetic fixtures were frozen before implementation
tests. The independent freeze verifier passed on the final tree.

| Component | SHA-256 |
|---|---|
| `docs/voice-verifier-v1-spec.md` | `8bf720cd8332c50721c2603291b0acad52ede90871f42d85eaf300c66580f55d` |
| `scripts/voice-eval/voice-verifier-v1-fixtures.json` | `12dbb1c80c06165388c8b91f1d7130a8564779c52daeb55a68bacd023a0e40b9` |
| Aggregate | `e9760a51ac9b4d5d96c1ec17bd5e672d2401deead63cbc06426f3c676a09cc5e` |

The guard normalizes CRLF/LF only and fails if content, the permitted file set,
or the aggregate changes.

## Implemented controls

- Immutable raw transcript plus a separate NFC normalized view.
- Typed recipient, action, product, amount, percentage, date, time, location,
  phone, power and energy evidence with raw spans and canonical values.
- Separate negation, correction, authority, provider-confidence and advisory
  semantic status channels.
- Fail-closed rejection of Unicode controls, format and bidi characters,
  zero-width characters, and mixed Latin/Devanagari/Cyrillic/Greek tokens.
- Raw evidence offsets remain exact when NFC composition changes UTF-16 length.
- Exact owner-scoped verified aliases only; no fuzzy, phonetic, edit-distance or
  automatic transliteration repair.
- Contact collisions, product collisions, unverified values and cross-owner
  records cannot resolve automatically.
- Contact destinations, display names and aliases are encrypted at rest. Only
  masked destinations and normalized alias hashes are stored outside ciphertext.
- Verification method, evidence hash, verified/revoked timestamps and tenant
  indexes are present in the registered migration.
- Semantic-verifier mocks are advisory, schema checked, byte-span checked, and
  required to cite the matching deterministic action span. They cannot lower a
  tier or grant authority.
- Tier 0–4 dispositions and fixed expiries are typed. Voice confirmation is
  never sufficient; restart never restores authority; V1 always returns
  `externalActionAllowed: false`.
- Risky or ambiguous voice input is durably held as `needs_clarification`
  before the agent path, with a safe response that does not echo the transcript.

## Deterministic benchmark

Command:

```powershell
.\node_modules\.bin\tsx.cmd scripts/voice-eval/benchmark-voice-verifier-v1.ts
```

Result over the 20 frozen synthetic cases, after warm-up:

| Measurements | p50 | p95 | p99 | max | Fixed p95 limit | External actions allowed |
|---:|---:|---:|---:|---:|---:|---:|
| 4,000 | 0.090 ms | 0.490 ms | 0.757 ms | 1.051 ms | 250 ms | 0 |

The first benchmark invocation stopped before measurement because top-level
`await` was incompatible with this workspace's CommonJS transform. The harness
was wrapped in an async entrypoint and the same frozen benchmark then passed.

## Verification

| Gate | Result |
|---|---|
| Freeze verification | PASS; exact hashes above |
| Focused freeze/verifier/schema/tenant/router tests | PASS; 5 files, 169 tests |
| Focused voice suite | PASS; 10 files, 252 tests |
| Complete unit/integration suite, one worker | PASS; 239 files, 1,380 tests |
| Workspace typecheck | PASS; shared, bot and dashboard |
| Lint | PASS; 0 errors, 5 unrelated pre-existing warnings |
| Production build | PASS; bot TypeScript and dashboard Next.js build |
| Non-live WhatsApp release gate | PASS; script explicitly performed no sends, OAuth actions or remote mutation |
| Focused Semgrep on all 10 new TypeScript files | PASS; 4 rules, 0 findings |
| Focused high-confidence secret scan | PASS; 24 implementation/evidence targets, 0 findings |
| Dependency validation | PASS; no package manifest or lockfile changes; local dependency listing resolved |
| `git diff --check` | PASS |

An earlier broad focused-Semgrep attempt reported 19 matches because the generic
`$HTTP.get(...)` rule also matches ordinary `Map.get` and registry `.get`
operations in existing large files. The matches were inspected, classified as
non-network false positives, and not suppressed. The exact new-file scan used
the same checked-in rules with metrics and version checks disabled and returned
zero findings.

The first focused verifier run also exposed a real implementation mismatch:
quoted/background speech was Tier 3 instead of the pre-frozen Tier 4. The tier
implementation was corrected without changing the frozen specification,
fixtures or thresholds; the complete final test matrix then passed.

## Browser and live evidence

Not applicable and intentionally not run. There was no UI change, browser run,
model execution, audio inference, NitsyClaw restart, WhatsApp process access,
WhatsApp send, 216-clip gate, cloud request or external recipient.

## Files and runtime state

Implementation changes are limited to:

- deterministic verifier modules and shared types under `packages/shared/src/voice`;
- owner-scoped verified contact/product schema, migration, journal and repo access;
- the bot's fail-closed post-transcription verifier hold;
- frozen synthetic fixtures, freeze guard, benchmark and regression tests;
- this specification and evidence.

No dependency, model, OAuth, deployment or runtime configuration changed. The
new database migration is authored and registered but was not applied.

## Remaining risk

- No recognizer was run; Qwen, Whisper and Nemotron quality remains exactly as
  recorded in prior frozen evidence.
- The deterministic lexicon is deliberately narrow. Unknown, disputed or
  unverified critical surfaces require text; broader language coverage still
  needs frozen adversarial evaluation.
- The semantic verifier is mock-only. No local semantic model has been selected,
  run or quality-gated.
- The verified contact/product directory has no owner-facing population or
  review UI in this task, and the migration has not been applied.
- The complete 216-clip voice and security release gates remain mandatory before
  any live voice recommendation. Voice remains NO GO.

## Next bounded action

Obtain separate approval to run a model-free mutation/adversarial evaluation of
Voice Verifier V1 against synthetic text only, including contact/product
collisions, Unicode confusables, stale/restart proposals, negation, corrections,
and unknown action phrasings. Do not run a live WhatsApp voice test.
