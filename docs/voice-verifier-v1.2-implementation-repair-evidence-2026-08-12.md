# Voice Verifier V1.2 implementation repair evidence

Date: 2026-08-12 (Australia/Sydney)

Branch: `codex/whatsapp-voice-intelligence`

Starting commit: `e71d8ee28263a216199af10006f6b1873de255f7`

Implementation commit before frozen execution: `7c84f5b33106ee8d8ae71176858fabcdfd19c109`

Verdict: **PASS for this text-only implementation repair**

Voice release: **NO GO**

No model, ASR, LLM, TTS, audio, WhatsApp message, WhatsApp restart, live data,
runtime database, external action, download, dependency change, OAuth change,
push, merge, deploy or publication was used.

## Authoritative starting evidence

- Frozen V1.2 aggregate: `39df02bc355242f41af0f1827576aaba97ae882f47b455a5a5f6eac07e3deb27`
- Initial result SHA-256: `1b08a2b6fa00676d9b54e9ff058333b17f7592bfdcbaa202659fbff7534dc85e`
- Initial result: 21 passed, 49 failed, 0 skipped.
- Every V1, V1.1 and V1.2 specification, fixture, runner, threshold, manifest,
  initial result and existing evidence file remained byte-identical.

## Failure-to-repair map

| Frozen failure class | Failed assertions | Bounded production repair |
|---|---:|---|
| Typed check intent | 1 | Added typed `check`; only a subjectless/pronominal check requires clarification; explicit quote and explicit local subjects remain non-authoritative local work. |
| Typed cancellation intent | 7 | Added Tier 4 `cancel`, separated it from linguistic negation, and kept all cancellation outcomes text-restatement gated. |
| Weekday and temporal safety | 7 | Added deterministic weekday/date agreement, real calendar-date validation, stale-context rejection, and the Australia/Sydney first-Sunday-in-October DST gap rule. |
| Semantic lifecycle | 5 | Added distinct timeout, late, cancelled, prior-process and partial/incomplete fail-closed statuses and reasons without lowering the deterministic tier or authority. |
| Atomic proposal binding | 27 | Added domain-separated token binding and exact proposal/owner/conversation/policy/token/state evaluation for both accepted values. |
| Production persistence contract | 1 | Added schema, migration and tenant-guarded repository paths carrying the complete six-field identity for lookup, confirmation, cancellation, expiry and consumption. |
| Deterministic safety module | 1 | Added the pure local proposal-binding module; it has no network or external-effect primitive and always returns `externalActionAllowed: false`. |
| **Total** | **49** | **All mapped without changing the freeze or safety thresholds.** |

## Persistence and migration

`packages/shared/drizzle/0012_voice_proposal_binding.sql` is authored and
registered but was **not applied** to any existing development, staging,
production or customer database.

The production contract now includes:

- composite proposal identity over proposal ID, owner hash, conversation hash
  and policy version;
- globally unique raw-token hash and token-binding hash;
- a six-column foreign key for both accepted and rejected confirmation rows;
- database-enforced hash lengths and cancellation/consumption state invariants;
- an accepted-once partial unique index preventing replay;
- `SELECT ... FOR UPDATE` before recording acceptance;
- atomic state predicates on cancellation, expiry and consumption;
- consumption only after an exact persisted accepted confirmation;
- tenant-owner checks on every repository path.

Disposable SQLite tests applied an equivalent constraint schema to isolated
temporary databases only. They proved matching accepted=0 and accepted=1,
all six mismatches rejected for both values, duplicate accepted confirmation
rejected, repeated rejection retained, cross-tenant token replay rejected,
transactional failure rollback, upgrade preservation of an existing sentinel
table, close/reopen persistence and cleanup. No disposable database remained.

## Verification

| Check | Final result |
|---|---|
| Focused verifier/schema/tenant/disposable-DB gate | PASS; 4 files, 55 tests |
| Complete model-free voice suite | PASS; 10 files, 252 tests |
| Qwen adapter/process mock suite | PASS; 5 files, 40 tests; no model inference |
| Non-live WhatsApp release gate | PASS; receipt 168, smoke 300, capability 172, reply-shape 26 passed / 108 intentionally skipped; no sends or restart |
| Complete applicable serial unit/integration suite | PASS; 240 files, 1,390 tests; V1/V1.1 superseded immutable runners excluded and the V1.2 runner reserved for its one authorized post-commit execution |
| Workspace typecheck | PASS; shared, bot and dashboard |
| Lint | PASS; 0 errors, 5 unrelated pre-existing warnings |
| Production build | PASS; bot TypeScript and dashboard Next.js production build |
| Historical/freeze hashes | PASS; V1, V1.1 and V1.2 immutable files and their initial-implementation blobs at the recorded commits verified |
| V1.2 initial-result hash | PASS; `1b08a2b6fa00676d9b54e9ff058333b17f7592bfdcbaa202659fbff7534dc85e` |
| Focused secret scan | PASS; 12 changed implementation targets, 7 high-confidence pattern families, 0 findings |
| Focused Semgrep | Completed; 4 local rules, 7 production targets, 13 manually reviewed false positives, 0 true positives; no suppression added |
| Dependency validation | PASS; manifests and `pnpm-lock.yaml` unchanged; 4 local workspace projects resolved |
| Performance / zero authority | PASS; fixed 250 ms p95 ceiling and zero `externalActionAllowed` assertions; exact p95 was not persisted by the frozen runner |
| `git diff --check` | PASS |

Semgrep's 13 findings were nine ordinary `Map.get` calls in `repo.ts`, three
`RegExp.exec` calls in `canonicalize.ts`, and one `Map.get` call for
`HOUR_WORDS`. The broad local rules misclassified those names as network or
child-process primitives. Manual source inspection confirmed no network,
shell, child-process or external-action call in the repaired path.

During development, the first complete voice run caught an overly broad
clarification rule for `check the weather tomorrow`; it was narrowed to the
proven ambiguous-object forms and the full 252-test voice suite then passed.
Exploratory runs of the protected V1 and V1.1 historical runners each retained
their already-superseded assertion mismatch: V1 expected the Sydney DST gap to
remain exact, while V1.1 retained the contradictory six-mutation outer
assertion corrected by V1.2. Those protected artifacts were not edited and are
not the authoritative post-repair gate.

## Single frozen post-repair execution

The unchanged V1.2 runner was executed exactly once after implementation commit
`7c84f5b33106ee8d8ae71176858fabcdfd19c109`. There was no retry.

- Result file: `scripts/voice-eval/voice-verifier-v1.2-adversarial-repair-run-01.json`
- Result SHA-256: `38783d382d901c37a4ade8482e3e68728db047e3966e58be9db67371b6f6420f`
- Suites: 10 passed, 0 failed.
- Assertions: 70 passed, 0 failed, 0 skipped.
- Result: success `true`.

## Remaining risk

- The PostgreSQL migration was not applied because no isolated disposable
  PostgreSQL instance was available and runtime database application was
  prohibited. Production SQL and Drizzle schema were statically verified;
  equivalent constraints were executed only in disposable SQLite databases.
- No recognizer, semantic model, audio pipeline or 216-clip quality gate ran.
- This proves a frozen synthetic text safety contract, not ASR quality or voice
  release readiness.
- Voice-derived data still grants no external authority. Any live or customer
  use requires a separate release authorization and later complete voice and
  security gates.

## Next bounded authorization

Authorize an isolated disposable-PostgreSQL migration rehearsal for migration
`0012_voice_proposal_binding.sql`, including forward application, constraint
mutation matrix, transactional rollback and clean teardown, with no runtime
database, model, WhatsApp or external action access.
