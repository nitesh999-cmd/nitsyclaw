# Voice Verifier V1 synthetic adversarial evidence — 2026-08-12

## Verdict

`BLOCKED` for the complete requested adversarial gate. The immutable runner
passed after six narrowly scoped implementation repairs, but the post-run
coverage audit proved that the frozen corpus omitted mandatory cases and that
one persistence assertion did not test the property named by the test. The
freeze was not modified after execution. Voice remains `NO GO`.

This was a text-only, model-blind evaluation. No ASR, LLM, TTS, audio, model,
WhatsApp process, WhatsApp send, external recipient, runtime database, OAuth,
deployment, push, merge, download, installation, or external action was used.

## Frozen boundary

The held-out artifacts were independently validated and committed at
`e543a9d` before Vitest executed the runner. The initial implementation was
commit `532a45b744e2ad0c626f02fe381a80f33e5a757b`.

| Frozen component | SHA-256 |
|---|---|
| Verifier V1 specification | `8bf720cd8332c50721c2603291b0acad52ede90871f42d85eaf300c66580f55d` |
| Adversarial specification | `93b287e3e666ecb31f3b2810a8e556478c53fbed99619aed23a760f7c10c2913` |
| Fixture corpus | `866a0409af7250b0572ef543eb1b71a6262f31110a914c997fd723908c071429` |
| Thresholds | `cad1983cccb00eaf1fb972e6536ada0170ef60c5119c510f4ba2331e89a551ef` |
| Runner | `21fc933c5fe1837ba44ecacc738f7920e438adf2dc863b898acf62b6686591f3` |
| Isolated SQLite schema | `d7b97fa9797bbb040426244afa5ee6d71bf12262f2ebdbace373507c900570b9` |
| Independent validator | `dfb20d12037583246a29c689a517f45a3ba1881c0fcb50fd9eb2f9301a9bd1ee` |
| Freeze verifier | `e9fbd0ad3dabfd89e6c1909968eed11514aa19e2ddfe79b5a69193a4b95f3dd3` |
| Immutable aggregate | `3cb4234a260e587f009dfbcbf0b12bdea84f698929c575dbf2c5d8a948f73aab` |
| Initial implementation aggregate | `dfe02309d9d9da8e1a8706d07f736845d024b19fb9cf62b82a345ed81680de0e` |
| Complete initial aggregate | `a204434600666173159bd9a880d34a526789b046c932e7cfa889b4fc0cebf275` |

The independent validator reported 14 explicitly safe and 57 explicitly
unsafe transcript cases, 13 semantic cases, 114 generated critical mutations,
17 state cases, 7 authorization cases, and 9 failure-injection cases.

| Category | Explicit cases |
|---|---:|
| actions | 22 |
| authority | 3 |
| authorization | 20 |
| collisions | 16 |
| contacts | 13 |
| correction | 2 |
| dates | 4 |
| multilingual | 11 |
| negation | 2 |
| numbers | 11 |
| products | 10 |
| prompt injection | 4 |
| state | 1 plus 17 state fixtures |
| tenant | 1 |
| Unicode | 14 |

## Execution chronology and immutable results

The first sandboxed Vitest invocation stopped while loading the repository
configuration because esbuild could not read a parent directory. It loaded no
tests and created no result file. The identical command then ran outside that
sandbox boundary.

| Run | Result | Tests | Evidence SHA-256 |
|---|---|---:|---|
| Initial implementation | fail | 105 passed, 32 failed, 0 skipped | `aac8b270095a12af952b37c8349fecc812b38fd8ca30caccdc71e26514b7ccd9` |
| Repaired implementation, unchanged freeze | pass | 137 passed, 0 failed, 0 skipped | `a39670da2b0a659b898b3886684391e8027ca0aa1b8926ccead0a74ce8ba7e0a` |

Both JSON reports are retained unchanged. The initial failures were all
classified as implementation defects within the cases that did execute:

- 14 action, authority, or authorization cases exposed missing consequential
  synonyms, Hindi forms, contextless confirmation, quoted-note authority,
  hypothetical discussion, and explicit authority-injection rejection.
- 2 recipient cases proved that the requested channel was ignored.
- 2 product cases proved that non-Tesla brand/model candidates were omitted.
- 3 numeric cases proved missing word-clock, spoken signed-currency, and IANA
  timezone extraction.
- 4 Unicode cases proved missing surrogate, compatibility-form, and combining
  overlay rejection.
- 4 semantic cases proved that extra authority/tool/confidence properties and
  overlapping evidence spans were accepted structurally.
- 2 authorization-tail cases were consequences of the missing action lexicon.
- 1 privacy-block case returned `null` because `dispatch` was not classified as
  an external action.

## Proven implementation repairs

Only production verifier modules changed after the initial run:

1. Added typed `confirm` action support plus English, Hindi, and Hinglish
   consequential action variants; recipient-bearing external actions are Tier
   4, and explicit tool/authority-field injection rejects.
2. Added quoted-note and hypothetical-discussion authority handling.
3. Added an optional typed recipient channel and filtered exact matches by that
   channel without fuzzy matching or alias creation.
4. Added conservative product candidates for known brand plus product-type or
   model-like text, without edit-distance or automatic repair.
5. Added deterministic `fifteen hundred`, signed spoken AUD, and fixed IANA
   timezone extraction as exact typed strings.
6. Rejected unpaired surrogates, compatibility characters, and combining
   overlays while preserving permitted NFC composition.
7. Enforced exact semantic object/span keys and types, known action values,
   non-empty byte-equivalent spans, and non-overlap. Semantic data remains
   advisory and cannot grant authority.

The repaired gate proves, for the frozen cases, zero external authorization,
100% unsafe blocking, 100% explicitly safe non-external acceptance, all 114
critical mutations blocked, all included Unicode attacks blocked, exact
included recipient/product resolutions, deterministic repeat/locale/timezone
results, four concurrent turns without cross-correlation, and isolated
rollback, expiry, duplicate-token, constraint, cleanup, redaction, and tenant
checks. The performance property executed 7,100 deterministic verifications
and passed its fixed calculated p95 limit of 250 ms; the runner did not persist
the exact calculated percentile.

## Frozen-corpus blocker

The freeze cannot support the requested overall PASS:

1. There is no explicit transcript case for a `check` action.
2. There is no explicit transcript case for a `cancel` action.
3. There is no weekday case.
4. There is no semantic-verifier timeout case.
5. The test named `enforces owner-bound, one-use, never-accepted confirmations`
   attempts a mismatched owner with `accepted=1`. It fails because the schema
   requires `accepted=0`, not because owner/conversation identity is bound to
   the proposal. A separate disposable `:memory:` reproduction inserted a
   mismatched owner and conversation successfully when `accepted=0` (one row),
   proving the frozen schema/runner does not test or enforce that named binding.

The aggregate validator checked category counts but did not assert these
mandatory subcases or the causal database constraint. Editing the corpus,
runner, schema, thresholds, or validator after observing output would violate
the freeze, so they remain byte-identical.

## Verification

| Check | Result |
|---|---|
| Independent fixture validation | pass; 14 safe, 57 unsafe, 13 semantic, 114 mutations, 17 state, 7 authorization, 9 failure cases |
| Pre-execution freeze and initial implementation verification | pass |
| Post-repair immutable freeze verification | pass; initial implementation check intentionally omitted because repaired files must differ |
| Repaired unchanged adversarial runner | pass; 137/137 |
| Focused legacy verifier | pass; 40/40 |
| Focused voice suite | pass; 10 files, 252 tests |
| Verifier/schema/tenant/router integration set | pass; 5 files, 304 tests |
| Non-live WhatsApp release gate | pass; no send, restart, remote mutation, or OAuth action |
| Complete serial unit/integration suite | pass; 240 files, 1,517 tests |
| Workspace typecheck | pass; shared, bot, dashboard |
| Lint | pass; 0 errors, 5 unrelated pre-existing warnings |
| Production build | pass; bot TypeScript and dashboard Next.js build |
| Focused Semgrep | completed; 4 local rules, 6 production targets, 1 inspected false positive and 0 true positives. The generic `$HTTP.get(...)` rule matched `HOUR_WORDS.get(...)`; no suppression was added. The frozen no-network primitive assertion passed. |
| Focused secret scan | pass; 17 implementation/freeze/result/evidence files, 8 high-confidence pattern families, 0 findings |
| Dependency validation | pass; package manifests and lockfile unchanged; local graph resolved 51 packages across 4 projects |
| Runtime database migration | intentionally not run |
| Isolated database tests | pass for the executed constraints; owner-binding gap documented above |
| Frozen artifact diff | unchanged after execution |
| `git diff --check` | pass before evidence commit |

## Remaining risk and exact next authorization

The repaired implementation is safer for the proven cases, but the complete
adversarial claim is blocked until a newly versioned freeze—not an edit of this
freeze—adds the missing action, weekday, semantic-timeout, and composite
proposal-owner-conversation binding evidence. No preview, live WhatsApp test,
directory migration, 216-clip evaluation, or release is authorized.

Exact next authorization:

`APPROVE VOICE VERIFIER V1.1 SYNTHETIC ADVERSARIAL RE-FREEZE — add only explicit check, cancel, weekday, semantic-timeout and composite proposal-owner-conversation binding cases in a new versioned text-only freeze, validate and commit before execution, then run it once; no models, audio, WhatsApp, downloads, dependencies, runtime migration or external actions.`
