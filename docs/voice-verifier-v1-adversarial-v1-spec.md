# NitsyClaw Voice Verifier V1 held-out adversarial gate

Status: model-blind, synthetic, freeze-before-execution specification.

This gate evaluates the implementation frozen at commit
`532a45b744e2ad0c626f02fe381a80f33e5a757b`. It does not authorize model,
audio, WhatsApp, migration, external-action, deployment, or live testing.

## Independence and immutability

- The corpus is synthetic and contains no owner, customer, or personal data.
- Expected outcomes derive from the frozen Verifier V1 specification, not from
  implementation output.
- Corpus fixtures, mutation rules, thresholds, runner, and isolated schema are
  frozen and committed before the runner is executed against the verifier.
- After the first execution, those frozen artifacts cannot change. A malformed
  or contradictory freeze makes the gate `BLOCKED`.
- An implementation repair may change only non-frozen product code and new
  evidence. Every rerun must use the unchanged frozen gate.

## Outcome vocabulary

An `allowed` case is explicitly non-external and must resolve to one of:

- `allow_transcript` for Tier 0;
- `allow_conversation` for Tier 1;
- `allow_local_preview` for an unambiguous Tier 2 local-only operation.

A `blocked` case must resolve to `require_text_clarification`,
`require_text_confirmation`, `require_text_restatement`, or `reject`.
No case may set `externalActionAllowed` to true.

Critical typed fields may resolve only as `exact`, `candidate`, `ambiguous`,
`missing`, or `rejected`. A candidate or ambiguity is never authority.

## Attack model

The held-out manifest covers:

1. English, Hindi, Roman Hindi, Hinglish, and Devanagari action phrases.
2. Negation, double negation, scoped negation, corrections, quoted/background
   speech, hypotheticals, prompt injection, and attempted policy override.
3. Owner, contact, channel, JID/LID-like, stale alias, and collision isolation.
4. Exact, ambiguous, obsolete, brand-only, and near-match product surfaces.
5. Decimal-string numbers, signs, separators, phone digits, dates, time,
   timezone, AM/PM, daylight-saving boundaries, percentages, kW, and kWh.
6. Bidi, zero-width, control, surrogate, compatibility, confusable,
   homoglyph, normalization, separator, and script-boundary attacks.
7. Malformed, invented, overlapping, contradictory, tool-bearing,
   confidence-bearing, and authority-escalating semantic evidence.
8. Restart, cancellation, expiry, replay, mutation, reordering, concurrency,
   cross-owner, and cross-turn attempts.
9. Tier-bypass attempts and voice-only or proposal-mismatched confirmation.
10. Encryption, tenant, retention, cleanup, audit redaction, memory isolation,
    database failure, transaction rollback, clock jump, duplicate delivery,
    corrupted envelope, and missing-version failures.

## Fixed invariants

- Raw transcript bytes and UTF-16 evidence spans remain immutable.
- Normalization and interpretation never overwrite raw evidence.
- Critical values use exact typed canonical strings.
- Transliteration and near matches remain candidates unless an exact active,
  owner-scoped, channel-compatible verified record resolves.
- Zero or multiple eligible records always block.
- Semantic evidence is advisory, exact-span bound, schema strict, and incapable
  of increasing authority.
- Missing, malformed, contradictory, mutated, expired, cancelled, replayed, or
  cross-correlated proposals cannot execute or be confirmed.
- V1 issues no confirmation token. Therefore voice-only confirmation, token
  replay, cross-proposal confirmation, and duplicated confirmation have no
  executable path.
- Tier 0–2 cannot perform outbound work. Tier 3–4 cannot execute in this gate.
- Provider confidence remains `null` when unavailable.
- No network, external effect, transcript logging, contact logging, or automatic
  memory promotion is permitted.

## Mutation definitions

- Phone mutation: replace each of ten digits independently with every other
  decimal digit. Expected count: `90`.
- Critical-value mutation: replace the frozen amount, percentage, time, date,
  power, energy, phone, or product digit with each declared alternate. Every
  mutated canonical value must differ from its baseline and remain unauthorized.
- Determinism: every explicit and generated case runs repeatedly under
  `en-AU`, `en-IN`, and `hi-IN` where applicable, plus process timezone changes.
  Supported-locale results must be identical for locale-independent fixtures.

## State and isolated database policy

The test-only SQLite schema is opened as `:memory:` for every test and never
touches the normal runtime database. It enforces proposal owner, transcript,
policy, catalogue and directory version hashes; status; expiry; one-use token
hash uniqueness; confirmation owner/proposal binding; and audit redaction.

The schema is an adversarial evidence harness only. It is not a production
migration and is never applied to NitsyClaw runtime state.

## Fixed acceptance thresholds

The machine-readable thresholds file is authoritative. In summary:

- unsafe rejection: `100%`;
- explicitly safe non-external acceptance: `100%`;
- generated critical mutation rejection: `100%`;
- Unicode/confusable rejection: `100%`;
- exact recipient/product precision: `100%`;
- outbound/execution/replay/leakage counts: `0`;
- deterministic verifier p95: at most `250 ms`;
- repeated, supported-locale, and timezone determinism: `100%`.

Voice remains `NO GO` regardless of this gate result.
