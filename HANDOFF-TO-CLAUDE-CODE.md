# Handoff: NitsyClaw dashboard agent-loop deploy — finish line

**Date:** 2026-04-29 (tonight, post-midnight Melbourne)
**Goal:** dashboard at `https://nitsyclaw.vercel.app/api/chat` runs full agent loop with all 10 NitsyClaw tools instead of deflecting to WhatsApp.

## Read these first, in order

1. `mind.md` — full project reference, especially §15 lessons L7-L17 (today's session)
2. `NitsyClaw-Constitution-v1.0.md` — R1-R20+ rules
3. NWP-Constitution-v1.2 (pinned in user's global settings — never copy-paste output, always run yourself, ≥3 sources, etc.)

## Current state (verified just before handoff)

- **Latest commit on origin/main:** `a8ef90a` "chore: remove yahoo-imap import"
- **PLUS one local commit not yet pushed:** "fix: re-export deps from shared/agent index for dashboard build"
- **Vercel:** still serving OLD vanilla-Anthropic chat code that deflects to WhatsApp
- **Last Vercel build error (from build log):**
  ```
  apps/bot/src/adapters.ts:9:3
  Type error: Module '"@nitsyclaw/shared/agent"' has no exported member 'AgentDeps'.
  ```
  This is FIXED on disk in `packages/shared/src/agent/index.ts` (added `export * from "./deps.js"`) but the fix is in a local commit, not on origin yet (or just landed minutes ago — verify).

## Critical context — secrets

- `.env.local` at project root has all real values now (user generated a fresh classic GitHub PAT today). `GITHUB_PAT` is real (40 chars, starts `ghp_`).
- `git remote get-url origin` should already have the PAT embedded from the last successful push.
- Vercel envs are CORRECT (DATABASE_URL clean, all token blobs uploaded).

## Architectural sin you'll hit

`packages/shared/src/features/04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26` have:
```ts
await import("../../../../apps/bot/src/adapters.js")
```

This is why the dashboard build type-checks bot files transitively. The bot has had multiple strict-mode violations (Yahoo, Google, OpenAI date handling) that all blocked the dashboard. We've fixed several. The clean fix is to refactor those dynamic imports through `AgentDeps` properly so dashboard never sees `apps/bot/*`. Tonight = patch level. Refactor = future session.

## What's been done today (don't redo)

- DB-not-configured fixed (was Vercel env-var corruption: `DATABASE_URL="DATABASE_URL=\"postgresql://...\""`).
- All 4 dashboard pages (reminders, memory, expenses, conversations) rewritten with proper dark theme.
- `/debug` page exists at `apps/dashboard/src/app/debug/page.tsx` — visit `https://nitsyclaw.vercel.app/debug` to see runtime env state.
- Bot package strict-mode fixes: `apps/bot/src/adapters.ts` (extMap subtype, embedding fallback), `google-auth.ts` (regex match guard, redirect_uris optional chaining).
- Yahoo unwired from `adapters.ts` (Yahoo Plus paywall, parked).
- Constitution R20 added (Vercel runtime/maxDuration on tool routes).

## Anti-patterns we burned hours on (don't repeat)

- **L7:** No em-dashes (—) in PowerShell scripts. ASCII hyphens only.
- **L8:** PowerShell multi-line commands fail silently. Use single-line semicolon chains.
- **L9:** `.git/index.lock` from crashed scripts blocks all subsequent git ops. Always `Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue` first.
- **L10:** `vercel link` auto-prompts to overwrite local `.env.local` with stripped Vercel env. Decline the auto-pull.
- **L11:** React 19 removed global JSX namespace. Don't annotate page components with `: JSX.Element`. Let TS infer.
- **L12:** Vercel "Import .env" preserves quotes literally — paste values WITHOUT surrounding quotes.
- **L13:** When Vercel build fails, it serves last-good. To surface real errors, redeploy WITHOUT cache via UI.
- **L14:** Bot dynamic-imports through shared poisons dashboard build. Fix bot strict-clean OR refactor.
- **L15:** `noUncheckedIndexedAccess: true` makes every array/dict index `T | undefined`. Add `?? fallback`.
- **L16:** Don't run `vercel env pull` carelessly — it's destructive to local `.env.local`.
- **L17:** Rule 15: NEVER ask user to paste output. Read it yourself via tools.

## What you need to do, in order

1. `git status` and `git log --oneline -5` to confirm state.
2. If the agent/index.ts fix is NOT on origin/main, push it: `git push origin main`.
3. Wait 100s, then `curl -s https://api.github.com/repos/nitesh999-cmd/nitsyclaw/commits/main | grep sha` to verify.
4. `curl -s -X POST https://nitsyclaw.vercel.app/api/chat -H "Content-Type: application/json" -d '{"history":[{"role":"user","content":"how many reminders do I have? use list_reminders tool"}]}'` — look for `"meta"` field in response.
5. If response has `meta.tools` with tool names → SUCCESS. Update mind.md §15 with completion.
6. If response still deflects → Vercel build still failing. Use Vercel CLI: `vercel logs --prod --token=$VERCEL_TOKEN` (token may need to be created — see `setup-vercel-token.md`).
7. If new TS error on Vercel → fix it locally, build locally to verify, commit, push, repeat.

## Files modified locally tonight, not yet on origin

- `packages/shared/src/agent/index.ts` (added `export * from "./deps.js"`)
- Possibly more — verify with `git status` and `git diff --staged`

## Smoke test once dashboard is live

Open `https://nitsyclaw.vercel.app/chat`. Type:
- "any birthdays this week or next?" → should call memory tool
- "what's on my plate today?" → should call whats_on_my_plate
- "how many reminders do I have?" → should call list_reminders or memory tool

If all three return tool-using answers (not WhatsApp deflection), task is DONE.

## When done

Append to `mind.md` a new section "## 17. Session 4 completion" with: final commit hash, sample successful API response, lessons learned, and any remaining technical debt. Then commit + push that doc update.
