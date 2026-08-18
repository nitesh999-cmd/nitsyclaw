# Voice Verifier V1.2 corpus-only re-freeze evidence

> **Superseded on 2026-08-14 by V1.3.** An authorized fixture correction changed bytes this corpus had
> already frozen, so `verify-voice-verifier-v1.2-adversarial-freeze.ts` now fails by design — that
> failure is the tamper-evidence mechanism reporting a real change, not a defect to repair. The V1.2
> corpus and freeze manifest are deliberately left exactly as frozen and must not be edited. See
> `docs/voice-verifier-v1.3-supersession-evidence-2026-08-14.md`, which carries the audit trail
> forward by cross-reference. The hashes recorded below remain correct as of 2026-08-12.

Date: 2026-08-12

Verdict: **FAIL**

Voice release: **NO GO**

## Outcome

The V1.2 re-freeze corrected only the contradictory persistence-runner assertion identified by V1.1. The corrected corpus was validated and committed before execution. It then ran exactly once and produced a valid deterministic result: **21 passed, 49 failed, 0 skipped, 70 total**.

No second execution or retry occurred. No production implementation repair was made.

## Freeze provenance

- authorized base commit: `eaff2ba5f223ec8ded19ae5d7c0f38bce3d0210e`;
- unchanged production implementation commit: `be4cd77e9f800493907ebcd7ea76fbac4f8086ee`;
- V1.2 freeze commit preceding execution: `2ab5770`;
- branch: `codex/whatsapp-voice-intelligence`.

V1.2 component hashes:

- corpus: `e2e0b1b20e922116adb3ac17a5e4a6637fcd65278a4b44b65bb7d8b577499f07`;
- corrected runner: `b65bf305cc011518afac06c8467abc1404ae89f35bf1b90027220efa30979ec4`;
- recorded before/after runner diff: `24fddd0c6a3f8fcc59bcc5766b4243f1b88a8ce3212e362de7bb4f4b5c3d5b84`;
- freeze verifier: `7adbe4bc812e7c4478409b485e14b3392d0755209e26bbbd03ecc4accfcf0cc0`;
- freeze manifest: `9a94981f7dc59fdc847066edee10d26a98b65550ba126560bfcae26919446556`;
- immutable aggregate: `39df02bc355242f41af0f1827576aaba97ae882f47b455a5a5f6eac07e3deb27`;
- initial implementation aggregate: `01265feddc5ff44d4136d13267ae070617b9ba034a2e0c9e4131cee6fa7186eb`;
- complete initial aggregate: `dd74de18b130cffe5a62955b7cab74b1c7466e9de9a2d7469b00c2520bf0b8f3`.

## Single authorized runner correction

The durable diff is `scripts/voice-eval/voice-verifier-v1.2-runner.diff`.

It proves the only runner change:

1. count each successful `toThrow()` rejection in `mutate_each_binding_field`;
2. assert the count equals the mutation array length;
3. assert the count is exactly six;
4. assert that the internally verified six-mutation operation itself does not throw;
5. retain the original outer throw/not-throw assertions for every other persistence operation.

The V1.2 freeze verifier reconstructs the corrected runner from the V1.1 runner with exactly those two textual replacements and fails if any other byte differs.

## Preserved corpus and counts

V1.2 references the unchanged V1.1 specification, fixtures, thresholds, validator, and isolated schema by their existing hashes. Nothing was copied and adapted to observed output.

| Category | Frozen fixture records | Runner assertions | Passed | Failed |
| --- | ---: | ---: | ---: | ---: |
| Freeze integrity | — | 1 | 1 | 0 |
| Check | 6 | 6 | 5 | 1 |
| Cancel | 7 | 7 | 0 | 7 |
| Weekday | 7 | 7 | 0 | 7 |
| Semantic lifecycle | 5 | 5 | 0 | 5 |
| Atomic binding | 26 | 27 | 0 | 27 |
| Isolated persistence | 12 | 13 | 13 | 0 |
| Production persistence contract | — | 1 | 0 | 1 |
| Deterministic safety properties | — | 3 | 2 | 1 |
| **Total** | **63** | **70** | **21** | **49** |

The seven additional assertions are freeze integrity, token binding, isolated rollback, production persistence, deterministic performance/authority, repeat determinism, and no-network-source isolation.

## Six-mutation proof

`db-token-binding-all-identity-fields` passed in 0.5733 ms.

The runner individually attempted and observed database rejection for mutations to:

1. proposal ID;
2. owner hash;
3. conversation hash;
4. policy version;
5. token hash;
6. token-binding hash.

It then asserted `rejectedMutations === mutations.length` and `rejectedMutations === 6`. The isolated persistence category consequently passed **13/13**, including both accepted variants, cross-owner, cross-conversation, copied-row, duplicate cross-tenant token, rollback, and the six-field mutation case.

This is evidence for the frozen isolated reference schema only. It is not evidence that the absent production proposal-binding implementation works.

## Initial V1.2 result

Result file: `scripts/voice-eval/voice-verifier-v1.2-adversarial-initial-run.json`

- normalized SHA-256: `1b08a2b6fa00676d9b54e9ff058333b17f7592bfdcbaa202659fbff7534dc85e`;
- Vitest success: `false`;
- total: 70;
- passed: 21;
- failed: 49;
- pending/skipped: 0;
- test-file assertion interval recorded by Vitest: 90.5 ms.

The deterministic p95/zero-authority assertion passed its frozen `≤250 ms` threshold, and repeated deterministic outputs passed. The result JSON does not expose the exact p95 measurement, so none is claimed. The no-network-source assertion failed only because the required production binding module is absent and therefore cannot be inspected.

## Observed implementation failures

No fixture defect, specification ambiguity, or execution-infrastructure failure remained in V1.2. The 49 failures are implementation gaps already signalled by V1.1:

- `check-ambiguous-object`: no typed `check` action was detected;
- all seven cancel cases: no typed `cancel` action was detected; the current policy also conflates `cancel` with negation;
- all seven weekday cases: no weekday entity or frozen temporal-context resolution exists;
- all five semantic lifecycle cases: timeout, late, cancelled, restarted, and partial states are ignored; the cancellation case also inherits the missing cancel action and Tier 1 instead of Tier 4;
- all 27 atomic-binding assertions: `packages/shared/src/voice/proposal-binding.ts` does not exist;
- production persistence contract: composite proposal/confirmation schema, migration, and complete repository paths do not exist;
- deterministic no-network source inspection: cannot inspect the absent binding module.

The safe isolated persistence reference passed, but production binding for `accepted=0` and `accepted=1`, replay, restart, owner, conversation, policy, expiry, cancellation, use, and token isolation remains unimplemented and unproven.

## Historical preservation

The protected V1 and V1.1 files had no Git diff before the V1.2 freeze and were verified by their existing freeze verifiers.

- V1 freeze manifest: `43b620915b7d78bcc3e9550e86567d51c7e161adf9e9660b8e8cc43bc0368539`;
- V1 initial result: `aac8b270095a12af952b37c8349fecc812b38fd8ca30caccdc71e26514b7ccd9`;
- V1 repaired result: `a39670da2b0a659b898b3886684391e8027ca0aa1b8926ccead0a74ce8ba7e0a`;
- V1 complete initial aggregate: `a204434600666173159bd9a880d34a526789b046c932e7cfa889b4fc0cebf275`;
- V1.1 freeze manifest: `0034f27116ac059dbd0d5671bc21fcb43069c2d4fe4f8884fb17f8cedf79b638`;
- V1.1 initial result: `837ed031e6c0f33f92308b5076482caca3434a81726547adfa532e3419064151`;
- V1.1 evidence: `c4e7a47b4695aa13ba978516c0c449c45fba95d6777c4f1880a21638e3c22b02`;
- V1.1 complete initial aggregate: `1a702eb10931e46dca794fb4b293ddb89887f6a45b9ff763ba378b1de352319a`.

## Commands and scope record

Completed before execution:

- V1 and V1.1 freeze verification;
- V1.1 initial-implementation hash verification;
- V1.1 input validator reuse;
- V1.2 exact runner-diff verification;
- focused compile-only TypeScript validation;
- V1.2 freeze verification with initial implementation hashes;
- `git diff --check`;
- local freeze commit.

Executed once after freeze:

```powershell
$env:HF_HUB_OFFLINE='1'; $env:TRANSFORMERS_OFFLINE='1'; $env:HTTP_PROXY='http://127.0.0.1:9'; $env:HTTPS_PROXY='http://127.0.0.1:9'; .\node_modules\.bin\vitest.cmd run packages/shared/test/voice-verifier-adversarial-v1.2.test.ts --reporter=json --outputFile=scripts/voice-eval/voice-verifier-v1.2-adversarial-initial-run.json
```

No model, ASR, LLM, TTS, audio, WhatsApp activity, runtime restart, download, installation, dependency or lockfile change, production migration creation/application, external action, push, merge, deployment, publication, or OAuth change occurred.

## Exact next authorization

`APPROVE VOICE VERIFIER V1.2 IMPLEMENTATION REPAIR — preserve all V1/V1.1/V1.2 freezes and initial results; repair only the 49 implementation failures proven by result 1b08a2b6fa00676d9b54e9ff058333b17f7592bfdcbaa202659fbff7534dc85e; enforce complete proposal-owner-conversation-policy-token binding in application queries and database constraints using isolated disposable databases only; do not apply any runtime migration; rerun the unchanged V1.2 corpus exactly once after repair; no models, audio, WhatsApp, downloads, dependency changes, external actions, push, merge, deploy or OAuth changes.`
