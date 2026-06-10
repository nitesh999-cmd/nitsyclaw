---
name: llmpc
description: Package the whole chat + codebase state — work done, in progress, planned/next, the idea/context, and the recent git diff — into ONE copy-paste prompt for an EXTERNAL premium LLM council to critique and propose next steps. (To make me run the council here instead, use /llmc.)
argument-hint: [optional focus or note to weave in]
---

# /llmpc — package this chat for an external LLM council

Your job is to emit **ONE self-contained, copy-paste prompt** that the user will
paste into their own external "premium LLM council". You are NOT running a
council here (that's `/llmc`). You are producing a briefing the user can hand
off.

## Step 1 — gather the live state (do this silently, then build the block)
- Working branch: `git rev-parse --abbrev-ref HEAD`.
- **Work done:** `git log --oneline -n 20` (this session's commits) — summarise each in plain English.
- **In progress / uncommitted:** `git status --short` and `git diff` (working tree).
- **Recent diff:** the changes made in this session. Prefer `git diff origin/<branch>...HEAD` plus any uncommitted `git diff`. If the combined diff exceeds ~400 lines, include `git diff --stat` for the full set PLUS the full diffs of only the most relevant files, and clearly mark `…(truncated)`.
- **Planned / next & open decisions:** pull from the conversation — the flagged "needs owner decision" items, recommendations, and anything explicitly deferred.
- **Idea / context:** the project's purpose, audience, stack, and hard rules.

## Step 2 — output exactly ONE fenced code block
Before the block, write a single line: "Copy the block below into your council:".
After the block, nothing except (optionally) one line noting if the diff was truncated. The block must be self-contained (the council has NO repo access). Use this template, filled from the gathered state. If `$ARGUMENTS` is non-empty, add it as a `FOCUS:` line near the top.

```
You are an LLM PREMIUM COUNCIL: four senior reviewers (Conversion/CRO, Front-end+Accessibility [WCAG 2.2 AA], UX/visual design, Brand+Honesty) who review independently, then reconcile into one consensus.

FOCUS: <only if provided, else omit>

PROJECT / IDEA:
<1–3 sentences: what this is, who it's for>

STACK & HARD RULES:
<stack in one line> · HARD RULES: no fake testimonials/logos/case-studies/metrics, no unsupported guarantees, no exaggerated claims, AA contrast, mobile-first, reduced-motion safe.

WORK DONE (this session):
- <commit/summary>
- <commit/summary>

IN PROGRESS / UNCOMMITTED:
- <or "none">

PLANNED / NEXT & OPEN DECISIONS (need owner):
- <item>

RECENT DIFF:
<diff or --stat + key file diffs; mark truncation>

YOUR TASK:
1) Red-team the work above across all four lenses; return a prioritised P1/P2/P3 list with exact locations and concrete changes (current → proposed).
2) Mark P1 = cross-validated by ≥2 lenses OR any accessibility/honesty-rule violation.
3) Separate "APPLY NOW" (high-confidence) from "FLAG — needs owner data/decision"; never fabricate to fill a gap.
4) Propose the prioritised next actions. Flag uncertainty as UNVERIFIED. Be specific and ruthless; no filler.
```

## Rules
- Output the block and (almost) nothing else — it must be paste-ready in one selection.
- Keep it honest: summarise only what actually happened; don't invent results or metrics.
- Do not push or change code; this command only reads state and emits text.
