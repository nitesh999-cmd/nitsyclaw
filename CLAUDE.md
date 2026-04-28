# NitsyClaw — Claude Code project entrypoint

> Auto-loaded by Claude Code when working in this directory. Read top-to-bottom before any non-trivial action.

## Boot order (mandatory, in sequence)

1. **`NWP-CONSTITUTION-v1.2.md`** — Nitesh Workflow Protocol. 7-step loop, Rule 15 (never ask user to paste), triggers (`*nwp` `*clarify` `*audit` `*stepN`), hard rules. The first or second tool call MUST be a TodoList of the 7 steps for any non-trivial task.
2. **`mind.md`** — living project reference (architecture, stack, current state, lessons L1–L20+, session log, return prompt).
3. **`NitsyClaw-Constitution-v1.0.md`** — R1–R20+ project rules (immutable; rules are appended, not edited).
4. **`PARKED-TASKS.md`** — backlog with trigger phrases.
5. **`HANDOFF-TO-CLAUDE-CODE.md`** *if present* — most recent session handoff.
6. **`CLAUDE-CODE-BACKLOG.md`** *if present* — full work backlog with priority order.

## First substantive response

Emit `NWP acknowledged` as the first line. Then proceed.

## Triggers

- `*nwp` — run full 7-step protocol explicitly
- `*clarify` — take NO action, click-questions only via AskUserQuestion
- `*audit` — dump evidence for every step
- `*stepN` — dump step N evidence
- `commit` `push` `check` `sync` `mind` `const` `memory` `todo` `priority` `review` `agent` — global keywords from `~/.claude/CLAUDE.md`

## Default operating posture

- Bot runs hidden in background via `silent-launcher.ps1`. Do NOT open visible PowerShell windows for it.
- Cloud bot is ABANDONED (R14 superseded by session-2 local-always-on decision). Do not retry Railway.
- Yahoo IMAP is intentionally skipped (paywall). Do not re-enable without explicit user ask.
- After ANY code change: commit and push automatically (R8). Auth via `.env.local` `GITHUB_PAT`.
- ASCII-only in PowerShell scripts (no em-dash, smart quotes, ellipsis). Single-line PS commands with semicolons.
- Always `Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue` before git ops.
- NEVER `vercel env pull` — destructive to local `.env.local`.
- Vercel "Import .env" preserves quotes literally — paste values WITHOUT surrounding quotes.
- When Vercel build fails, redeploy WITHOUT cache via UI to surface real errors.
- `bot/*` files type-check transitively from dashboard via dynamic imports in `packages/shared/src/features/04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26`. This is the architectural sin tracked in `mind.md` §14 debt list — scheduled for cleanup `trig_01XYHgVLJMMAVQQbBAFjr7Az` (May 12, 2026).
- React 19 removed JSX namespace — don't annotate page components with `: JSX.Element`.

## Rule 15 (most-violated, repeat)

NEVER ask the user to paste terminal output, logs, command results, error messages, or file contents. ALWAYS run the command via Bash/Read/Grep/subagent and read output yourself. If blocked, escalate via 3 paths (different tool / different agent / read from disk) before asking. Forbidden phrases: "Can you paste...", "Run this and show me...", "What does X return?", "Send me the log...".
