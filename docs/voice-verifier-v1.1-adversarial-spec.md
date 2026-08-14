# NITSYCLAW Voice Verifier V1.1 synthetic adversarial gate

Status: frozen before execution

Date: 2026-08-12

Initial implementation commit: `be4cd77e9f800493907ebcd7ea76fbac4f8086ee`

## Purpose

This text-only gate closes five explicitly bounded evidence gaps left by the Voice Verifier V1 gate: direct check intent, cancellation intent and state, weekday resolution, semantic-verifier lifecycle failures, and atomic proposal binding. It does not evaluate ASR, language-model quality, speech generation, WhatsApp delivery, or any external action.

The fixtures and expected outcomes are synthetic and were written before any V1.1 execution. The initial result must be retained even if the implementation fails. After the freeze commit, the specification, fixtures, thresholds, runner, isolated schema, validator, and freeze verifier are immutable.

## Non-authority invariant

Every V1.1 result must retain both of these properties:

- `externalActionAllowed` is always `false`.
- A matching proposal binding is evidence of correlation only; it is never voice authority to execute an external action.

No Tier 0-2 fixture may acquire an external capability. No Tier 3-4 fixture may execute.

## Check action contract

`check` is an explicit, non-external action. A verified, specific local object such as a quote may be previewed at Tier 2. A pronoun-only or otherwise ambiguous object requires text clarification. Negation requires text restatement. Quoted, media, or background speech is not owner authority and requires text restatement. English, Roman Hinglish, and Devanagari forms must produce the same safe intent class.

## Cancellation contract

`cancel` is an explicit consequential action and is not a negation token. Voice alone cannot cancel a proposal. A direct cancellation is Tier 4 and requires a text restatement. A negated cancellation, quoted/background cancellation, completed proposal, missing proposal, or proposal belonging to another owner or conversation must remain blocked.

A pending proposal may be identified as eligible for a later authenticated text cancellation only when its full binding is valid. This eligibility does not mutate state and does not grant external-action authority.

## Weekday contract

Weekday extraction is deterministic and locale-independent. Without a frozen temporal anchor, a weekday alone is ambiguous. With a numeric date, the weekday is exact only when the calendar date agrees. A disagreement rejects the weekday/date combination.

Numeric dates use the declared locale; this corpus freezes Australian day/month/year handling. A temporal context is valid only when its version equals the current version. Stale context rejects weekday resolution. A local wall time that does not exist at an Australian daylight-saving transition rejects the combined date/time/timezone instruction.

No current system clock, process timezone, or network time source may influence these results.

## Semantic lifecycle contract

The advisory semantic verifier is non-authoritative. Timeout, late output after timeout, output after cancellation, output from a previous process epoch, and partial output all fail closed. Each condition has a distinct status and reason. A lifecycle failure may increase caution but must never lower the deterministic tier, change owner authority, or permit an external action.

## Atomic proposal-binding contract

A proposal record is usable only when all of these fields match atomically:

1. proposal ID;
2. owner hash;
3. conversation or session hash;
4. policy version;
5. raw confirmation token hash;
6. token-binding hash covering proposal ID, owner hash, conversation hash, policy version, and raw token;
7. pending state;
8. unexpired state;
9. uncancelled state;
10. unused state.

The binding algorithm is:

```text
SHA-256(
  "NITSYCLAW-VOICE-PROPOSAL-BINDING-V1" + NUL +
  proposalId + NUL +
  ownerHash + NUL +
  conversationHash + NUL +
  policyVersion + NUL +
  rawToken
)
```

The raw token itself is never persisted. Its independent SHA-256 hash must be globally unique so that copying the same token across tenants is rejected even though the identity-bound hash would differ.

All lookup, update, confirmation, cancellation, expiry, and consumption queries must carry proposal ID, owner hash, conversation hash, and policy version. Confirmation persistence must additionally carry both token hashes. The database must enforce the same composite relationship. A mismatch rejects regardless of `accepted=0`, `accepted=1`, proposal state, or execution state.

The isolated SQLite schema is a normative test representation of the required constraint semantics. It is not a runtime database and must never be applied to normal NitsyClaw state.

## Frozen acceptance thresholds

- 100% safe check fixtures accepted locally.
- 100% unsafe check and cancellation fixtures blocked.
- 100% explicit check/cancel action and negation correctness.
- 100% weekday/date/timezone conflicts rejected.
- 100% semantic lifecycle failures fail closed without tier reduction.
- 100% proposal/owner/conversation/policy/token mismatches rejected for `accepted=0` and `accepted=1`.
- Zero replay, copied-row, cross-owner, cross-conversation, or cross-tenant acceptance.
- Zero external-action authority.
- Deterministic verifier p95 no more than 250 ms on the local gate host.
- Zero network or external-effect primitives in the evaluated deterministic path.

## Execution protocol

1. Validate fixture structure, exact required case IDs, calendar facts, token hashes, matrix completeness, and isolated constraints without importing or calling the implementation.
2. Hash and commit every immutable artifact plus the initial implementation files.
3. Execute the V1.1 runner exactly once against the initial commit and retain the result unchanged.
4. Classify failures as implementation defect, fixture defect, specification ambiguity, or infrastructure failure.
5. Stop as BLOCKED for a fixture defect or ambiguity. Otherwise repair only proven implementation defects.
6. Rerun the unchanged corpus and retain every result.
7. Run the prior V1 freeze and release checks.

## Scope exclusions

No model, audio, ASR, LLM, TTS, WhatsApp operation, network inference, download, installation, dependency change, lockfile change, runtime migration, real identity, external action, push, merge, deployment, publication, or OAuth change is authorized.
