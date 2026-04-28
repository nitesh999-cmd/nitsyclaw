# NitsyClaw — Full Remaining Backlog for Claude Code

> Read NWP-CONSTITUTION-v1.2.md first. Acknowledge NWP. Then work through this list in priority order. Don't ask user to paste anything (Rule 15). Auto-execute everything reachable via tools. Update mind.md after each completed task.

## Priority 0 — Finish what's in flight

### 0.1 Verify session 3 is closed
- `git log origin/main --oneline -5` — confirm latest commit on origin matches local
- `git status` — confirm no pending uncommitted work
- `curl -s -X POST https://nitsyclaw.vercel.app/api/chat -H "Content-Type: application/json" -d '{"history":[{"role":"user","content":"how many reminders do I have? use list_reminders tool"}]}'` — response must contain `"meta":{"rounds":...,"tools":[...]}` field
- If meta is missing or tools array is empty: Vercel build is still failing or system prompt isn't routing to tools. Iterate until live API uses tools.

### 0.2 Update mind.md with session 3 + 4 closure
- Append "## 17. Session 3 final" with: full DB-corruption story, /debug page introduction, agent-loop wiring, all lessons L7-L18.
- Append "## 18. Session 4" with whatever Claude Code does in this run.
- Commit + push.

## Priority 1 — Architectural debt (real fix, not patch)

### 1.1 Refactor shared→bot dynamic imports
**Problem:** `packages/shared/src/features/04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26` have `await import("../../../../apps/bot/src/adapters.js")`. This causes the dashboard build to type-check `apps/bot/src/*` transitively, which is why every bot strict-mode error blocks the dashboard.

**Fix:**
1. Add to `packages/shared/src/agent/deps.ts`:
   ```ts
   export interface EmailCalendarAggregator {
     fetchAllEventsToday(timezone: string): Promise<Array<{ source: string; title: string; start: Date }>>;
     fetchAllUnreadEmails(perAccountLimit?: number): Promise<Array<{ source: string; from: string; subject: string; date: Date }>>;
   }
   ```
2. Add `aggregator?: EmailCalendarAggregator` to `AgentDeps`.
3. In `04-morning-brief.ts` and `05-whats-on-my-plate.ts`, replace dynamic imports with `args.deps.aggregator?.fetchAllEventsToday(...)` calls.
4. In `apps/bot/src/adapters.ts` `buildAgentDeps()`, pass `aggregator: { fetchAllEventsToday, fetchAllUnreadEmails }`.
5. In `apps/dashboard/src/app/api/chat/route.ts` `buildDashboardDeps()`, pass `aggregator: undefined` (dashboard can't reach Google/M365 tokens from disk).
6. Run `pnpm build` from dashboard. Should now pass without bot files in compilation graph.
7. Commit, push, verify Vercel.

**Why this matters:** future bot work will never again block dashboard deploy.

### 1.2 Delete dead scripts
Remove these files (superseded, defunct, or one-time):
- `nuke-and-go.ps1` (legacy launcher, replaced by silent-launcher)
- `prep-for-railway.ps1` (Railway abandoned)
- `final-db-fix.ps1` (one-time, applied)
- `fix-db-not-configured.ps1` (one-time, applied)
- `fix-vercel-envs.ps1` (one-time, applied)
- `add-email-everywhere.ps1` (one-time, applied)
- `merge-all-into-brief.ps1` (one-time, applied)
- `add-dashboard-tools-voice-outlook.ps1` (superseded by route.ts edit)
- `codify-scope-lessons.ps1` (one-time, applied)
- `force-deploy.ps1` (one-time)
- `commit-and-push.ps1` (one-time)
- `PUSH-MORNING.ps1` (one-time, broken `--reset --hard`)
- `PUSH-NOW.ps1` (one-time, applied)
- `SESSION-4-COMPLETION-STEPS.md` (superseded by HANDOFF + this file)
- `setup-vercel-token.md` (move content into mind.md if Vercel token gets created, then delete)

Keep:
- `silent-launcher.ps1`, `broom.ps1`, `nitsy-status.ps1`, `setup-always-on.ps1`, `go-silent.ps1` (active infrastructure)

## Priority 2 — Dashboard polish (free, high leverage)

### 2.1 Voice in on /chat (Web Speech API, ~15 min)
Per `PARKED-TASKS.md` Task 1. Add mic button to `apps/dashboard/src/app/chat/page.tsx`. Toggle recording; stream interim results into input box; auto-send on stop.

### 2.2 Voice out on /chat (~10 min)
Per `PARKED-TASKS.md` Task 2 step 1. After API returns reply, call `window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply))`. Use saved voice from localStorage if set.

### 2.3 Persona switcher in Settings (~15 min)
Per `PARKED-TASKS.md` Task 2 step 2. Settings page lists `speechSynthesis.getVoices()` as cards; tap card → preview + save to localStorage.

## Priority 3 — High-value features

### 3.1 Outlook calendar write (~30 min)
Bot can read Outlook events but can't create them. Extend `schedule_call` feature in `packages/shared/src/features/07-schedule-call.ts` to accept `calendar: 'personal' | 'solarharbour' | 'outlook'` param. When `outlook`, call `createMsEvent` (already implemented in earlier draft at `apps/bot/src/microsoft-graph.ts`). Default to `personal`. Update tool description to route based on user's mention ("wattage" / "work" → outlook, "solar harbour" → SH, else personal).

### 3.2 Telegram bot backup channel (~45 min)
Per `PARKED-TASKS.md` Task 8. New `TelegramClient` adapter implementing `WhatsAppClient` interface. Same agent loop, same DB, same tools. User asks: needs Bot Token from BotFather. Don't start until user provides it.

## Priority 4 — UI glow-up (~90 min)

Per `PARKED-TASKS.md` Task 3. Full redesign:
- Geist Sans font, violet→blue accent, slate-950 dark theme, 8px radius
- Mobile bottom tab bar instead of side rail
- Glass-frosted cards on Today
- Streaming text animation in chat
- PWA manifest + Apple touch icon
- Splash screen
Touches all 7 pages (`/`, `/chat`, `/conversations`, `/memory`, `/reminders`, `/expenses`, `/settings`) and `apps/dashboard/src/app/layout.tsx`.

## Priority 5 — Maintenance + hygiene

### 5.1 Rotate exposed API keys
Mind.md §11 says: ANTHROPIC_API_KEY, OPENAI_API_KEY, Supabase password were pasted in chat earlier. User said "deferred until things get serious". Generate new keys for all three; update Vercel env vars; update local `.env.local`; restart bot.

### 5.2 Fix CI workflow YAML
`.github/workflows/ci.yml` has empty `with:` blocks (lines 14, 35) after we removed `version: 9` to fix pnpm conflict. Cosmetic fix: remove the bare `with:` lines entirely. Add `packageManager: pnpm@9.12.0` to the action call (which is what pnpm/action-setup uses by default when `version` omitted).

### 5.3 Add a CLAUDE.md to project root
Create `C:\Users\Nitesh\projects\NitsyClaw\CLAUDE.md` that imports NWP-CONSTITUTION-v1.2.md plus pointers to mind.md, Constitution, parked tasks, handoff. Means future Claude Code sessions auto-onboard.

## Priority 6 — Test coverage drift

### 6.1 Write tests for session 2/3 additions
Untested code paths:
- `fetchAllEventsToday` and `fetchAllUnreadEmails` aggregator
- Multi-account google-auth `listGoogleAccounts()`
- Microsoft Graph `fetchMsEventsToday` / `fetchMsUnread` / `createMsEvent`
- `runAgent` from dashboard surface
- Self-chat-only filter in `wwebjs-client.ts`

Aim for 70% line / 65% branch coverage per Constitution R15.

### 6.2 Re-run E2E
Playwright tests probably broken by UI changes. Update selectors, run `pnpm test:e2e`.

## Priority 7 — Documentation

### 7.1 Update Constitution
Add R21+ rules from session 3 lessons:
- R21 — ASCII-only in PowerShell scripts
- R22 — Always clear .git/index.lock before git ops
- R23 — Never run `vercel env pull` (destructive)
- R24 — Vercel env values pasted without surrounding quotes
- R25 — When Vercel deploy stale, redeploy without cache to surface real error
- R26 — Shared package never imports from `apps/*` (R16 reaffirmed with concrete path violation)

### 7.2 Update mind.md
- §4: folder layout reflects deletions from 5.1.2
- §5: feature 7 (schedule_call) supports Outlook write
- §6: connected accounts table — add any new Vercel token if created
- Sections 17 + 18 closing this two-day saga

## Done-state

A NitsyClaw user (you) can:
- Open `https://nitsyclaw.vercel.app/chat` on phone or laptop
- Type or speak (voice in) any question
- Hear answer (voice out, configurable persona)
- See real DB data on /reminders, /memory, /expenses, /conversations
- /chat uses all 10 tools (no WhatsApp deflection)
- Bot still runs locally, hidden, auto-recovers
- Telegram bot working as backup channel
- All 7 pages re-themed with new design system
- Tests pass, CI green, Vercel green
- mind.md and Constitution reflect current reality

## Order of work (if energy/time limited)

1. Priority 0.1 (must close out tonight's work)
2. Priority 1.1 (fixes class of bugs, foundational)
3. Priority 0.2 + 5.3 + 7.1 + 7.2 (docs while you're in there)
4. Priority 2.1, 2.2, 2.3 (voice — quick wins)
5. Priority 3.1 (Outlook write — useful)
6. Priority 1.2 (dead-code cleanup)
7. Priority 4 (UI glow-up — biggest, save for fresh session)
8. Priority 3.2 (Telegram — depends on user providing token)
9. Priority 5.1 (key rotation — when "things get serious")
10. Priority 5.2 (CI cosmetic)
11. Priority 6 (tests — chip away over time)

## Reporting

After each completed priority, append a 5-line summary to mind.md §18. After all done OR after running out of energy, write a final report at top of mind.md.
