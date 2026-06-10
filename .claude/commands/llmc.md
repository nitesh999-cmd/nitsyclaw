---
name: llmc
description: Run the LLM Premium Council HERE — convene a parallel panel of four senior expert reviewers (Conversion/CRO, Front-end+Accessibility, UX/visual, Brand+Honesty), synthesise the cross-validated consensus, and run a full improve cycle on the agenda. Applies fixes locally and ASKS before pushing. (To instead get a copy-paste prompt for an external council, use /llmpc.)
argument-hint: [agenda, e.g. "tighten the Offers section" — omit to review the current work]
---

# /llmc — run the LLM Premium Council (full cycle)

You are convening the **LLM Premium Council**: a panel of senior expert-persona
review agents. Be honest about what this is — these agents run on the same
model, not external vendors' LLMs. Never claim otherwise.

## Agenda
- If `$ARGUMENTS` is non-empty, that is the agenda — focus the whole cycle on it.
- If `$ARGUMENTS` is empty, the agenda is **the current work / most recent
  changes** in this session (the working branch diff and whatever we were last
  editing).

## Hard rules (never break)
- Honour the project's hard rules: **no fake testimonials, logos, case studies,
  metrics, or unsupported guarantees**; no exaggerated claims; no filler.
- Apply fixes **locally only**. **Do NOT push** — finish by asking for explicit
  approval to push (and respect the designated working branch).
- Keep changes targeted, reversible, and tested. Fix P0/P1 before P2/P3.

## The cycle (run end to end)

1. **Scope** — restate the agenda in one line and list the files/areas in play.

2. **Research (only if the agenda needs it)** — if the task benefits from
   outside input (competitor patterns, best practices), spin up research
   agent(s) with WebSearch/WebFetch. Skip for pure code/review tasks.

3. **Convene the panel — ALWAYS all four, in parallel** (one message, multiple
   Agent calls), each with a tight non-overlapping remit and pointed at the
   relevant files:
   - **Conversion / CRO** — funnel logic, friction, CTAs, lead capture, section order.
   - **Front-end + Accessibility** — code quality, WCAG AA (contrast, focus,
     keyboard, ARIA), responsive, performance, hydration/SSR, dead code.
   - **UX / visual design** — hierarchy, section rhythm, mobile usability,
     premium feel, anything that looks templated or cheap.
   - **Brand + honesty** — positioning, copy sharpness ("sharp, practical,
     premium, no-guru"), and ruthless enforcement of the no-fake-proof rules.
   Tell each agent it is review-only (no edits) and to return a prioritised
   P1/P2/P3 list with file + exact change.

4. **Synthesise** — collect all four reports and produce a single consensus
   action list. Prioritise **cross-validated** items (flagged by ≥2 reviewers)
   and any hard a11y/honesty-rule violations as P1. Separate:
   - **Apply now** = high-confidence fixes that don't need the owner's input.
   - **Flag, don't guess** = anything needing real data or a product/brand
     decision (pricing, real proof artifacts, brief-mandated copy changes,
     external integrations). List these for the owner — never fabricate.

5. **Implement** the "apply now" set. Then run the gates that exist:
   `npm run lint` and `npm run build` (from `nitesh-site/`), or the project's
   equivalents. Fix anything they surface.

6. **Verify** — smoke-check the change actually rendered/behaves (e.g. start the
   prod server and grep the output, or run the relevant test).

7. **Report & stop** — commit locally with a clear message, then summarise:
   - the consensus and what was applied (files changed),
   - lint/build/verify results (pass/fail with evidence),
   - the "flag, don't guess" items needing the owner,
   - and **ask for explicit approval to push**. Do not push until told to.

Finish with the project's required closing: (1) next best revenue move,
(2) failure-prevention move, (3) your recommendation.
