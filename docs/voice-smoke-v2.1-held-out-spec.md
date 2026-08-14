# NITSYCLAW-VOICE-SMOKE-V2.1 held-out scorer specification

Status: scorer-only, synthetic, model-blind validation. This specification does
not replace, reinterpret, or modify V1 or V2 evidence and authorizes no ASR run.

## Methodology

The corpus is derived only from the owner-approved coverage categories. It uses
new synthetic people, locations, businesses, amounts, dates and command shapes.
No Nemotron or Whisper transcript is a fixture source. The only repeated product
pairs are `SH8RS`/`SH10RS` and `Powerwall 2`/`Powerwall 3`, which the owner
explicitly required.

The corpus is held out from ASR: it is frozen before its scorer or tests execute,
and no model may be selected, loaded or evaluated during this stage.

## Independent channels

1. Preserve raw fixture text unchanged.
2. Test declared lexical equivalence separately from action safety.
3. Canonicalize typed critical fields: recipient, action, date, time, timezone,
   amount, currency, percentage, phone, location, power, energy, product and
   model.
4. Compare critical fields only by exact typed canonical value.
5. Analyze negation, double negation, corrections and command context separately.
6. Permit an external action only when every critical field matches, the action
   is direct and affirmative, and no ambiguity, quote, background speech or
   explicit non-action marker is present.

## Allowed equivalence

- benign case, punctuation and spacing;
- exact spoken/numeric numbers;
- exact joined or spaced AM/PM notation;
- exact Australian or Indian date forms with an explicit locale;
- exact fixed-date timezone offsets;
- identical currency, percentage, phone, power and energy values;
- declared Roman/Devanagari mappings for general lexical comparison only.

## Forbidden equivalence

- changed recipient, action, date, time, timezone, amount, sign, currency,
  percentage, phone digit, location, unit, product or model;
- name or identifier edit distance, phonetic repair or automatic transliteration;
- `fifteen`/`fifty`, `kW`/`kWh`, `SH8RS`/`SH10RS`, or Powerwall 2/3 collapse;
- draft/send, call/message, or quote/order collapse;
- stripping Unicode format controls, mixed-script homoglyphs or zero-width
  characters at a critical boundary;
- treating quoted, background, negated, corrected or explicitly non-action text
  as an executable instruction.

Ambiguous numeric dates require an explicit `en-AU` or `en-IN` locale. Named
zones are compared at the action date; a matching current offset never grants
equivalence without that date. General lexical equality never changes the
critical-field or external-action verdict.

## Threshold preservation

Critical-field accuracy, intent/action accuracy, negation/context accuracy,
Unicode rejection and mutation rejection remain fixed at 100 percent. No WER or
aggregate lexical result can override a failed safety channel. Missing confidence
continues to require explicit owner confirmation before any external action.
