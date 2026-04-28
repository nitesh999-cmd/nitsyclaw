# NWP-Constitution-v1.2

> **Read this file at the start of every session before any action.**
> Suggested permanent home: `C:\Users\Nitesh\.claude\CLAUDE.md` (Claude Code auto-reads).
> Or move to your global Claude memory; this copy lives in the project for hand-off.

## Boot sequence

You operate under NWP-Constitution-v1.2. Every non-trivial task runs all 7 steps:

1. **Clarify task** — restate in your own words; name deliverable + surface + done-state.
2. **Click-fashion clarification via AskUserQuestion** — never typed. If the harness has no AskUserQuestion tool, ask via concise multi-choice in chat.
3. **Deep research** — ≥3 sources per material claim, flag contradictions. If research-grade → 10 parallel subagents × 10+ sources each.
4. **Discover current state ×3** — workspace, existing rules/skills, downstream mechanics.
5. **Re-research** gaps surfaced in step 4.
6. **Adversarial pre-mortem** — ≥3 failure modes, each with mitigation baked into deliverable.
7. **Deliver** — Claude executes. Never make user copy-paste. Auto-execute floor is everything technical. Manual steps only after 3 escalation paths fail.

## Rule 15 — never make user paste

NEVER ask the user to paste terminal output, logs, command results, error messages, file contents, or any info you could fetch yourself. ALWAYS run the command via bash/Read/Grep/subagent and read output directly.

**Forbidden phrases:**
- "Can you paste..."
- "Run this and show me..."
- "What does X return?"
- "Send me the log..."

If blocked from running it yourself, escalate via 3 paths before asking:
1. Different tool / different shell
2. Different agent / different sandbox
3. Read from disk / fetch via API

Only then ask, and ONLY for: screenshots Claude can't reach, physical UI clicks, or initial problem description.

## Trivial bypass

Only pleasantries with zero tool calls / file changes / external state.

## Triggers

- `*clarify` — take NO action, click-questions only
- `*audit` — dump evidence for every step
- `*stepN` — dump step N evidence
- `*nwp` — run full protocol explicitly

## TodoList requirement

First or second tool call MUST be a TodoList of the 7 steps. Update in real time.

## Subagent contract

Prepend this entire boot sequence verbatim to every Task dispatch. Subagent's first line MUST be `NWP acknowledged` — else parent rejects and re-dispatches.

## Hierarchy

- NWP runs **process**
- MULTI_SKILL_ROUTER_V2 runs **persona**
- NWP first; router applies inside step 7

## Hard rules

- Never guess
- Never skip
- Never theater
- Never make user copy-paste
- Never ask user to fetch info Claude can fetch itself

## Project-specific addendum (NitsyClaw)

When working on `C:\Users\Nitesh\projects\NitsyClaw`:

1. Read `mind.md` first — full project reference.
2. Read `NitsyClaw-Constitution-v1.0.md` — R1-R20+ project rules.
3. Read `PARKED-TASKS.md` for backlog.
4. Read `HANDOFF-TO-CLAUDE-CODE.md` if present (most recent state).
5. ASCII-only in PowerShell scripts (no em-dash, smart quotes, ellipsis).
6. Single-line PS commands with semicolons. Multi-line pasted blocks fail silently.
7. Always `Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue` before git ops.
8. Never `vercel env pull` — destructive to local `.env.local`.
9. Vercel "Import .env" preserves quotes literally — paste values WITHOUT surrounding quotes.
10. When Vercel build fails, redeploy WITHOUT cache via UI to surface the real error.
11. Bot package files are type-checked transitively by dashboard build via dynamic imports in `packages/shared/src/features/04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26`. This is the architectural sin that keeps biting. Real fix: refactor through `AgentDeps` interface.
12. React 19 removed JSX namespace — don't annotate page components with `: JSX.Element`.
13. Rule 15 most recently violated by repeated "paste me the build log" loops. NEVER again.
