# Voice Verifier V1.3 supersession evidence

**Date:** 2026-08-14
**Base commit:** `d4b284b0e5a344bd8e5501b8c506e71c29924041`
**Voice release authorized:** no. Voice remains NO GO.

## Why V1.3 exists

An authorized correction to `scripts/voice-eval/voice-verifier-v1.1-adversarial-fixtures.json`
changed bytes that the V1.2 corpus had already frozen. Three records went stale:

| Artifact | V1.2 recorded | Actual after the correction |
|---|---|---|
| V1.1 freeze manifest | `0034f27116ac059dbd0d5671bc21fcb43069c2d4fe4f8884fb17f8cedf79b638` | `5ce8e1a0d2da14463a84a21b0bd436713c7f1641616b4ac9a0ec22c54ff37e08` |
| V1.1 evidence document | `c4e7a47b4695aa13ba978516c0c449c45fba95d6777c4f1880a21638e3c22b02` | `93a50ec38f198eb79602f4f919961792c801330653c84e89f3a19748bf13af7f` |
| V1.2 corpus | `e2e0b1b20e922116adb3ac17a5e4a6637fcd65278a4b44b65bb7d8b577499f07` | `bddc6f823cb30408d077edea47ad05e60e9a819a74c8590f51fdda62540b9257` |

Rewriting those three values in place would have made `verify-voice-verifier-v1.2-adversarial-freeze.ts`
pass again, but the `historicalEvidence` field exists precisely to prove those artifacts did not
change. Rewriting it to match a change would make the control vacuous for every future correction.

V1.2 is therefore left exactly as frozen, and **its verifier now fails by design** — that failure is
the tamper-evidence mechanism reporting a real event. This follows the precedent that produced V1.2
itself, which was cut as a "corpus-only re-freeze" rather than an edit to V1.1.

## The correction being carried forward

Fixture `db-token-binding-all-identity-fields` (operation `mutate_each_binding_field`) moved from
`expectedRejected: true` to `expectedRejected: false`.

This closes a false negative, it does not weaken the suite. Under the original V1.1 runner an
accepted binding mutation raised inside `expect(() => insertAttempt(...)).toThrow()`; that assertion
error propagated out of `operation`, so the outer `expect(operation).toThrow()` passed **precisely
when a binding mutation was wrongly accepted**. With `false`, the outer operation must complete
normally while all six mutations are each proven rejected — the repaired V1.2 runner counts them
explicitly via `expect(rejectedMutations).toBe(6)`.

`verify-voice-verifier-v1.3-adversarial-freeze.ts` asserts the corrected value and the three repaired
runner assertions directly, so the false negative cannot be silently reintroduced.

## What V1.3 records

The V1.3 corpus verifies every prior artifact byte-for-byte at its current digest. For the three
artifacts the correction legitimately changed, it also records the pre-correction digest, the reason,
and **where V1.2 still records that digest**. The verifier reads the untouched V1.2 corpus and freeze
manifest and asserts the recorded "before" value matches. The audit trail is preserved by
cross-reference rather than by rewriting.

Frozen V1.3 values:

- corpus: `6e581300bdf50c413fab48da630e08b175f8e412d519380abc7a09021cabc2cf`;
- freeze verifier: `8948f3dca6c93939220f23611d51b48c1d7c7f16b1c9a6c3d55e60c39e839735`;
- immutable aggregate: `a910618f06ecb81e559b6139a63c5b47715d33b1c2a8c4d41197f906ffe265e3`;
- implementation snapshot aggregate: `1dcec92b9a8ff2a28136ac371f8244221bf4ebc71f9c7483a06ccea7d73aafad`;
- complete aggregate: `a7846e8ecd60d3750582b2bf19665ceb21f129d858656a5b2911e3e82469eb03`.

Carried forward unchanged from V1.1: immutable aggregate
`53b81088c8cd4547a541519312d8d1aad96b630d1eeffb6212c5b2e39d0d3d97`, complete initial aggregate
`1a702eb10931e46dca794fb4b293ddb89887f6a45b9ff763ba378b1de352319a`. Fixture counts are unchanged at
63 records and 70 runner assertions; only one boolean moved.

The implementation snapshot records where the voice implementation stood at this freeze. It is only
re-proven under `--snapshot`, because voice is NO GO and the implementation is still moving; the
snapshot **metadata** aggregate is verified on every run.

## The gate hole this closes

The V1.2 chain broke silently. No test imported the V1.2 verifier and `.github/workflows/ci.yml` has
no voice step, so lint, typecheck and all 2008 tests stayed green with a provably snapped hash chain.

`scripts/voice-eval/verify-voice-verifier-v1.3-freeze.test.ts` now runs the V1.3 verifier under
`pnpm test`, so any future break in this chain fails CI.

## Commands and scope record

- `pnpm exec tsx scripts/voice-eval/verify-voice-verifier-v1.3-adversarial-freeze.ts` — passes.
- `pnpm exec vitest run scripts/voice-eval/verify-voice-verifier-v1.3-freeze.test.ts` — 4 passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — pass.
- Every digest above was recomputed independently, and cross-checked by a second model working from
  the hashing rule alone rather than from this repository's verifier output.

No migration, deployment, bot restart, provider change or WhatsApp message was performed. Voice
remains NO GO and `voiceReleaseAuthorized` stays `false` in both the V1.2 and V1.3 corpora.
