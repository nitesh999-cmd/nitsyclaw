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
- **`*add <description>`** — request a new feature. Claude (a) inserts a row into the `feature_requests` Postgres table tagged `source='dashboard'` (since Claude Code runs on your laptop, treat it as the dashboard surface for traceability), THEN (b) decides: if small (< ~30 min, self-contained) and you're online, implements + commits + pushes + updates docs (R29) immediately and marks the row `done` with the commit hash. If larger or you're stepping away, leaves it `pending` for the daily build agent (`trig_01XiN9ZowcHufrXkcNzMkJbe`, fires 12:00 UTC) to pick up. One-line confirmation either way includes the `feature_requests.id`. Example: `*add voice input on /chat page using Web Speech API` or `*add weekly summary email of my expenses every Sunday`.
- `commit` `push` `check` `sync` `mind` `const` `memory` `todo` `priority` `review` `agent` — global keywords from `~/.claude/CLAUDE.md`

## Push notifications (R37)

Bot fires `pushNotify` on every WhatsApp send — POSTs to ntfy.sh topic (`NTFY_TOPIC` in `.env.local`). Subscribe on each device:
- **Phone:** install free ntfy app (iOS / Android), tap "Add subscription", enter the topic.
- **PC browser:** open `https://ntfy.sh/<topic>`, click Subscribe (allow notifications).
- **Windows toast:** set `WINDOWS_TOAST=true` for a local desktop toast in addition to ntfy.

Default topic: `nitsyclaw-b3011652d4279674` (rotate at any time by changing `.env.local`).

## After every fix (R29 — non-negotiable)

Every code commit pairs with doc updates IN THE SAME PUSH. Never "I'll catch up the docs later." Specifically:
- `mind.md` — append session-log row + any new lesson L<n> + update tech-debt list
- `NitsyClaw-Constitution-v1.0.md` — add new R<n> if behavior, infra, or invariant changed; append fixes-log row
- `CLAUDE-CODE-BACKLOG.md` — mark item done / add follow-ups
- `PARKED-TASKS.md` — promote/retire items if scope shifted
- `CLAUDE.md` (this file) — only if boot-order or default-posture changed
- Push everything in a single git push, not separate commits across hours

If mind.md isn't touched by your last commit, the fix isn't done.

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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
