# Voice Verifier V1.1 synthetic adversarial evidence

Date: 2026-08-12

Verdict: **BLOCKED**

Voice release: **NO GO**

## Stop reason

The V1.1 corpus contains a frozen runner contradiction in `db-token-binding-all-identity-fields`. The operation correctly performs six inner assertions that each mutated composite field is rejected. After all six assertions succeed, the shared outer branch also expects the entire operation to throw because the fixture carries `expectedRejected: true`. A successful inner proof therefore becomes a failing outer assertion.

This is a corpus defect discovered only after the first execution. The frozen protocol explicitly requires a BLOCKED stop instead of editing the corpus after execution. No product implementation repair was made and the V1.1 runner was not rerun.

## Freeze evidence

Freeze commit: `0604b7d`

Initial implementation commit: `be4cd77e9f800493907ebcd7ea76fbac4f8086ee`

Fixture counts:

- check: 6;
- cancel: 7;
- weekday: 7;
- semantic lifecycle: 5;
- proposal binding: 26;
- isolated persistence: 12;
- total frozen fixture records: 63;
- runner assertions including freeze, rollback, production-contract, performance, determinism, and no-network checks: 70.

Frozen hashes:

- immutable aggregate: `c5f4b0b0f91242d246eab6c91366f41d7d514c5f1bd44e83add6911cb0bcd920`;
- initial implementation aggregate: `01265feddc5ff44d4136d13267ae070617b9ba034a2e0c9e4131cee6fa7186eb`;
- complete initial aggregate: `dc04b3293df0ef48d3ff525fc97eedde4a78f8ca4214a4962aa80caf8803a62a`;
- specification: `258da0683450c18df3266c0c42cce22df871babe8a69fa29d9497944124d0d8b`;
- fixtures: `dd8ea85e6fab8089edc262255762668bc5b3677851f51088b167aac8f4e20e6f`;
- thresholds: `4713dccfeab227c58bf78cc400b89e34cf79d028485240a6ea5f40f982813daa`;
- runner: `e84cb0c2aa59b4f550fb73fc86c9639f28a79242547d2b5040f3ae45fe86dae3`;
- isolated schema: `4a81f4562e52ca6bc20f6cea91ebbb3d024c23f68b999696cd4bddb05f91c386`;
- validator: `fe2cad771a67a5385a6634704500d307a6942c8e28baeae89e5e195d6ce726f8`;
- freeze verifier: `13434260376b2c2a54f99ed6271a8f2fb816ce69efe2acb56bd531be206c2f9f`;
- synthetic token hash: `967121ab59a25354b97a2547c57c35c1943f633789013e39c9f1ecd5c0d4bba9`;
- synthetic identity-bound token hash: `dd2cf4324f94d342d51833567617446ecc9dc18a9aef0099447c60c430b34e97`.

The prior V1 freeze verified unchanged. Its immutable result hashes remain:

- initial V1 result, 105/137: `aac8b270095a12af952b37c8349fecc812b38fd8ca30caccdc71e26514b7ccd9`;
- repaired V1 result, 137/137: `a39670da2b0a659b898b3886684391e8027ca0aa1b8926ccead0a74ce8ba7e0a`.

## Initial immutable execution

Result file: `scripts/voice-eval/voice-verifier-v1.1-adversarial-initial-run.json`

Normalized SHA-256: `837ed031e6c0f33f92308b5076482caca3434a81726547adfa532e3419064151`

Result: **20 passed, 50 failed, 0 skipped, 70 total**.

The first sandboxed Vitest process was denied access while loading `vitest.config.ts`. It loaded no test, created no result file, and is classified as a pre-execution sandbox startup failure. The escalated process was the first and only actual V1.1 execution and created the immutable result above.

Failure classification from the actual run:

| Area | Failed | Classification | First causal observation |
| --- | ---: | --- | --- |
| Check | 1/6 | implementation signal | Ambiguous `check` has no typed action. |
| Cancel | 7/7 | implementation signal | `cancel` has no action and is incorrectly treated as negation. |
| Weekday | 7/7 | implementation signal | No weekday entity or temporal-context resolution exists. |
| Semantic lifecycle | 5/5 | implementation signal | Lifecycle input is ignored and remains `unavailable`; one case also inherits the missing cancel action. |
| Atomic binding | 27/27 | implementation/security signal | The production `proposal-binding.ts` contract does not exist. |
| Isolated persistence | 1/13 | **fixture defect** | Six inner rejection assertions pass, then the outer `toThrow` contradicts them. |
| Production persistence contract | 1/1 | implementation/security signal | Production composite schema, migration, and repository paths do not exist. |
| Deterministic safety | 1/3 | implementation signal | The required binding module is absent. |

No failure was classified as a specification ambiguity. The actual test process itself had no infrastructure failure.

## Accepted zero and accepted one behaviour

The frozen isolated schema rejected wrong-owner, wrong-conversation, and wrong-owner-plus-conversation confirmation rows for both `accepted=0` and `accepted=1`. That proves only the reference constraint behaves correctly.

The production implementation has no atomic proposal-binding module, no V1.1 composite proposal tables, and no complete repository paths. Consequently, production owner/conversation/token binding for either `accepted=0` or `accepted=1` is **not implemented and not proven**. The 12 frozen mismatch cases for each accepted value could not reach a production evaluator because the module was absent.

## Changes and non-changes

Committed before execution:

- V1.1 specification;
- fixtures and thresholds;
- deterministic validator;
- immutable freeze verifier and manifest;
- isolated disposable SQLite schema;
- V1.1 test runner.

Preserved after execution:

- immutable initial JSON result;
- this evidence record.

No verifier, repository, runtime schema, migration journal, historical freeze, scorer, dependency, or lockfile was changed after the initial run. No normal-runtime migration was created or applied.

## Verification completed before the blocked stop

- repository, branch, initial HEAD, and tracked cleanliness: PASS;
- V1 immutable freeze reproduction: PASS;
- V1.1 fixture validator: PASS before execution;
- exact required case-set validation: PASS;
- synthetic calendar and Sydney DST fact validation: PASS;
- token and identity-bound hash validation: PASS;
- isolated six-column composite foreign-key validation: PASS;
- V1.1 freeze verification including initial implementation hashes: PASS;
- compile-only TypeScript check of the runner, validator, and freeze verifier: PASS;
- pre-freeze `git diff --check`: PASS;
- initial V1.1 execution: FAIL, 20/70 passed;
- post-run unchanged V1.1 execution: intentionally not run because the frozen corpus is defective.

The complete voice, integration, migration, WhatsApp, serial, typecheck, lint, build, Semgrep, dependency, and release gates were intentionally not run after the required BLOCKED stop. They cannot turn a defective frozen corpus into release evidence.

## Privacy and external-effect record

All fixtures use synthetic text and synthetic hashes. No model, audio, ASR, LLM, TTS, WhatsApp process, WhatsApp message, recipient, runtime database, cloud inference, download, installation, dependency change, network inference, external action, OAuth change, push, merge, deployment, or publication occurred. The actual gate ran with Hugging Face and Transformers offline flags and invalid loopback HTTP/HTTPS proxies. No product path containing a network or send primitive was executed.

## Exact next authorization

`APPROVE VOICE VERIFIER V1.2 CORPUS-ONLY RE-FREEZE — replace only the contradictory outer throw assertion with an explicit six-mutation rejection count, preserve the V1.1 initial result, validate and commit the corrected immutable corpus before one new execution; no implementation repair, models, audio, WhatsApp, downloads, dependencies, runtime migration or external actions.`
