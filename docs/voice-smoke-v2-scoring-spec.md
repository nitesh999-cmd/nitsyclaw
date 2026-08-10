# NITSYCLAW-VOICE-SMOKE-V2 scoring specification

Status: model-blind frozen offline smoke specification. It does not change or
supersede the committed V1 result.

## Independent channels

1. Preserve the raw transcript byte-for-byte as evidence.
2. Compute lexical WER after only declared, typed equivalences. No fuzzy match,
   stemming, phonetic match, or automatic critical-entity transliteration is
   allowed.
3. Match each critical entity through exact frozen surface forms that map to one
   typed canonical value. Any frozen conflicting form fails the entity.
4. Score required intent phrases, conflicting actions, negation, and correction
   markers separately.
5. Report language and Unicode script independently.
6. Produce a safety verdict from critical entities, intent, and negation. WER
   cannot override a safety failure.

## Allowed equivalence boundary

The lexical channel may equate case, spacing, punctuation, exact spoken/numeric
values, exact times, identical currency values, `kilowatt`/`kW`, and explicitly
listed correct Roman/Devanagari forms. Typed canonicalizers preserve sign, unit,
date, time, decimal value, phone digits, model digits, and Unicode identity.

The scorer never uses edit similarity for names, locations, model identifiers,
recipients, actions, confirmation state, or action-critical numbers. `fifteen`
does not equal `fifty`; `10 kW` does not equal `10 kWh`; `SH8RS` does not equal
`SH10RS`; `Powerwall 3` does not equal `Powerwall 2`; and Latin letters do not
equal lookalike Cyrillic characters.

## Fail-closed rules

- All critical entities and intents must pass.
- Negation must match the expected state and correction ambiguity fails.
- Missing provider confidence remains `null` and requires explicit owner
  confirmation before any external action.
- A passing WER with a failed recipient, entity, action, or negation remains a
  failed safety verdict.
- The two-case smoke must meet the unchanged V1 thresholds. A V2 failure blocks
  construction of the 216-clip gate.

The canonical machine-readable specification and all positive/adversarial
fixtures are in `scripts/voice-eval/voice-smoke-v2-spec.json`. The freeze file
hashes that corpus and the scoring implementation; the runner refuses to start
if either hash changes.
