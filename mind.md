# mind.md — NitsyClaw

> Living technical reference. Read at the start of every session before doing any work.
> Updated: 2026-04-27 (session 2 — multi-account email/calendar + silent mode)

---

## 1. What this project is

**NitsyClaw** is Nitesh's personal AI assistant.

- **Channels:** WhatsApp self-chat (primary), Vercel dashboard at https://nitsyclaw.vercel.app (browser, anywhere)
- **Brain:** Anthropic Claude Sonnet 4.6 with tool use (10 P0 features as tools)
- **Hosting:** local laptop (always-on) for the bot, Vercel for the dashboard, Supabase for the DB. Cloud bot abandoned (see §10).
- **Owner number:** `61430008008` (Australia)
- **Timezone:** `Australia/Melbourne`

One-line pitch: "Text or voice-note NitsyClaw on WhatsApp. It does the work. The dashboard at nitsyclaw.vercel.app is where I check, edit, and steer it."

---

## 2. Stack (locked — Constitution R13–R16)

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+) |
| Monorepo | pnpm workspaces |
| WhatsApp | whatsapp-web.js + LocalAuth (Path B — personal, single-recipient) |
| LLM | Anthropic Claude Sonnet 4.6 |
| Voice (input) | OpenAI Whisper API |
| DB | Supabase Postgres + pgvector |
| ORM | Drizzle |
| Dashboard | Next.js 15 + Tailwind + shadcn-flavored components |
| Tests | Vitest + Playwright |
| Hosting (dashboard) | **Vercel — `nitsyclaw.vercel.app`** |
| Hosting (bot) | **Local PC (always-on, hidden, auto-restart)** |
| Scheduler | node-cron inside the bot |
| Email/calendar (Google) | googleapis (multi-account labeled tokens) |
| Email/calendar (Microsoft) | Microsoft Graph (device-code OAuth) |

Cloud bot via Railway/whatsapp-web.js was attempted and **abandoned** (see §10).

---

## 3. Architecture

```
   WhatsApp ──► whatsapp-web.js ──► Bot worker (LOCAL, hidden)
                                          │
                                          ▼
                                   Agent Loop (Claude tool use)
                                          │
              ┌───────────────────────────┼─────────────────────────────┐
              ▼                           ▼                             ▼
        Postgres                    Tool calls                    Schedulers
      (Supabase +                  (10 features +              (node-cron, in
       pgvector)                  multi-source aggregator)      bot process)
              ▲
              │ read/write
              │
        ┌─────┴───────────────┐
        ▼                     ▼
   Dashboard (Vercel)    Dashboard (localhost:3000)
   nitsyclaw.vercel.app
```

**Single source of truth = Supabase Postgres** (R5).
WhatsApp surface and Dashboard surface are read/write UIs over the same schema.

---

## 4. Current folder layout (post-session-2)

```
NitsyClaw/
├── package.json                ← pnpm workspaces root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── playwright.config.ts
├── .env.local                  ← all secrets (gitignored)
├── .env.local.example
├── .gitignore
├── mind.md                     ← this file
├── NitsyClaw-Constitution-v1.0.md
├── README.md
├── PARKED-TASKS.md             ← rolling backlog (voice, UI glow-up, Telegram)
│
├── google-credentials.json     ← gitignored — Google OAuth client
├── google-token.json           ← gitignored — personal Gmail token (default label)
├── google-token-solarharbour.json  ← gitignored — SH Workspace token
├── ms-token.json               ← gitignored — Microsoft 365 OAuth tokens
│
├── nuke-and-go.ps1             ← legacy launcher (visible windows; superseded by silent mode)
├── silent-launcher.ps1         ← starts bot+dashboard HIDDEN with logs to logs/
├── broom.ps1                   ← runs every 2 min; restarts dead procs, kills stray windows
├── nitsy-status.ps1            ← health check ("is it alive?")
├── setup-always-on.ps1         ← one-time: power plan, startup shortcut, watchdog
├── go-silent.ps1               ← one-time: kills visible windows, registers broom, switches to silent
├── prep-for-railway.ps1        ← (defunct) we abandoned Railway; keep for reference only
├── add-email-everywhere.ps1    ← one-time: added multi-account email scaffolding
├── merge-all-into-brief.ps1    ← one-time: wired aggregator into brief + plate
│
├── logs/
│   ├── bot.log                 ← live bot output (hidden process)
│   ├── dashboard.log           ← live dashboard output
│   └── broom.log               ← watchdog actions
│
├── apps/
│   ├── bot/                    ← whatsapp-web.js worker (runs locally)
│   │   ├── package.json        scripts: dev, start, google:auth, ms:auth
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts        ← entry point
│   │       ├── wwebjs-client.ts ← WhatsAppClient impl (self-chat-only filter)
│   │       ├── router.ts       ← inbound message routing
│   │       ├── scheduler.ts    ← cron (morning brief w/ aggregator)
│   │       ├── adapters.ts     ← LLM + Google Cal + Multi-account aggregator
│   │       ├── google-auth.ts  ← multi-account labeled-token OAuth
│   │       ├── microsoft-auth.ts ← M365 device-code OAuth
│   │       ├── microsoft-graph.ts ← M365 mail + calendar fetcher
│   │       └── yahoo-imap.ts   ← Yahoo IMAP (unused — see §6)
│   └── dashboard/              ← Next.js 15 (deployed to Vercel)
│       ├── package.json
│       ├── next.config.js
│       └── src/app/
│           ├── layout.tsx
│           ├── page.tsx        ← Today
│           ├── chat/page.tsx   ← Browser chat (Claude conversational)
│           ├── api/chat/route.ts ← Server route → Claude
│           ├── conversations/page.tsx
│           ├── memory/page.tsx
│           ├── reminders/page.tsx
│           ├── expenses/page.tsx
│           └── settings/page.tsx
└── packages/
    └── shared/
        └── src/
            ├── db/             ← Drizzle schema, client, repo
            ├── whatsapp/       ← interface + mock
            ├── agent/          ← loop, tools, deps, memory
            ├── features/       ← 10 P0 features (one file each)
            └── utils/
```

---

## 5. The 10 P0 features (status)

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Text command (NLU dispatch) | ✅ working | All WhatsApp/dashboard input lands here |
| 2 | Voice capture → transcribe → file | ✅ working | OpenAI Whisper |
| 3 | Reminders (one-shot + recurring) | ✅ working | node-cron in bot |
| 4 | Morning brief (7am cron, Melbourne) | ✅ working | **NEW: aggregates all email + calendar sources** |
| 5 | "What's on my plate today?" | ✅ working | **NEW: aggregates events from all calendars** |
| 6 | Memory recall | ✅ working | Lexical search + pgvector ready |
| 7 | Schedule call (calendar write) | ✅ working | Google Calendar (Outlook write not yet wired) |
| 8 | Web research | ✅ stub | Real provider deferred |
| 9 | Confirmation rail | ✅ working | y/n flow before destructive actions |
| 10 | Receipt → expense logged | ✅ working | Vision + auto-categorize |

---

## 6. Connected accounts (as of 2026-04-27)

| Service | Account | What's wired | Auth method |
|---|---|---|---|
| Google Calendar | `nitesh999@gmail.com` (label: `personal`) | Read events | OAuth — token at `google-token.json` |
| Gmail | `nitesh999@gmail.com` (label: `personal`) | Read unread | Same token |
| Google Calendar | `nitesh@solarharbour.com.au` (label: `solarharbour`) | Read events | OAuth — token at `google-token-solarharbour.json` |
| Gmail Workspace | `nitesh@solarharbour.com.au` (label: `solarharbour`) | Read unread | Same token |
| Outlook Calendar | `Nitesh@thewattage.com.au` (Wattage M365) | Read events | Azure App `NitsyClaw-Wattage` (single-tenant) — token at `ms-token.json` |
| Outlook Mail | `Nitesh@thewattage.com.au` (Wattage M365) | Read unread | Same token |

### Skipped accounts

- **Yahoo (`nitesh999@yahoo.com`)** — App Passwords UI no longer visible on this account; forwarding to Gmail requires Yahoo Plus paid tier. Skipped to save $5/mo. `yahoo-imap.ts` exists in code but not wired (no env vars set). If Yahoo becomes critical: re-enable via Yahoo OAuth dev approval (slow, often denied for personal).
- **Auspro M365** — Work winding down, no admin rights. Not pursued.

### Wattage Azure config (for future ref)

- App name: `NitsyClaw-Wattage`
- App type: **Single-tenant** (after `isMSAApp` mistake on first attempt; see Constitution fixes log)
- Tenant ID: `d2c7cd55-7c20-4689-bcdb-16daccc747ed`
- Auth: device-code flow, redirect URI `https://login.microsoftonline.com/common/oauth2/nativeclient`
- "Allow public client flows" = **Yes**
- Permissions: Mail.Read, Mail.ReadWrite, Calendars.Read, Calendars.ReadWrite, User.Read, offline_access (admin consent granted)

---

## 7. Run commands (silent mode)

```bash
# Health check — what's alive?
powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\nitsy-status.ps1

# Manual silent restart (also runs automatically every 2 min via broom)
powershell -ExecutionPolicy Bypass -File C:\Users\Nitesh\projects\NitsyClaw\silent-launcher.ps1

# Watch live logs
Get-Content C:\Users\Nitesh\projects\NitsyClaw\logs\bot.log -Tail 30 -Wait
Get-Content C:\Users\Nitesh\projects\NitsyClaw\logs\dashboard.log -Tail 30 -Wait
Get-Content C:\Users\Nitesh\projects\NitsyClaw\logs\broom.log -Tail 30

# Auth flows when adding accounts
pnpm google:auth                # personal Gmail
pnpm google:auth solarharbour   # additional labeled Google account
pnpm ms:auth                    # Microsoft 365 device code

# Tests (still scaffolded)
pnpm test
pnpm test:coverage
pnpm test:e2e

# DB
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

---

## 8. Silent mode + auto-recovery

After session 2, NitsyClaw runs hidden by default.

- **silent-launcher.ps1** — kills stale node, clears wa-session locks, launches bot + dashboard with `-WindowStyle Hidden`. Output goes to `logs/bot.log` and `logs/dashboard.log`.
- **broom.ps1** — scheduled task **NitsyClaw Broom**, runs every 2 min:
  - If bot or dashboard process is gone → relaunch hidden
  - If any visible (non-hidden) PowerShell is running NitsyClaw scripts → kill it (kills stragglers from old launches)
- **Windows Startup shortcut** — points at silent-launcher.ps1, so login = NitsyClaw alive within 30 sec
- **Power plan** — laptop never sleeps (set by `setup-always-on.ps1`). Lid close = do nothing. Display can sleep — that's fine.

If something breaks: `nitsy-status.ps1` to diagnose, then check `logs/`.

---

## 9. Deploy (current state)

| Surface | Location | URL/path | Auto-start |
|---|---|---|---|
| Bot | Local laptop, hidden | n/a (process) | ✅ on Windows login + every 2 min broom |
| Dashboard local | localhost:3000 | http://localhost:3000 | ✅ on Windows login |
| Dashboard cloud | Vercel | https://nitsyclaw.vercel.app | Auto-deploys on `git push origin main` |
| Database | Supabase | (Postgres pooled URL) | Always on |
| GitHub | Public repo (private setting) | https://github.com/nitesh999-cmd/nitsyclaw | n/a |

**Note on Vercel domain:** project renamed `nitsyclaw-dashboard` → `nitsyclaw`. Both `nitsyclaw.vercel.app` and the legacy `nitsyclaw-dashboard.vercel.app` work; legacy redirects to the new one with HTTP 307.

---

## 10. Decisions made today (R-rule cross-reference)

| Decision | Rule | Reasoning |
|---|---|---|
| Cancel Railway, keep bot local | Updates R14 implicitly | User's PC always on; cloud bot's whatsapp-web.js + Puppeteer combination kept crashing on Railway after 5 hours of debugging. Local always-on is simpler, free, more reliable |
| Yahoo skipped (not paying $5/mo for forwarding) | n/a | Yahoo dropped app-password UI for Nitesh's account; forwarding paywalled |
| Wattage M365 single-tenant (not multi-tenant) | n/a | First attempt registered under personal MSA path → AADSTS70002 error. Re-registered inside Wattage tenant |
| Auto-recovery via broom (not pm2/NSSM) | n/a | Scheduled-task + hidden launchers is native Windows, no extra deps |
| API keys NOT yet rotated | n/a | User pasted real keys in chat earlier; deferred rotation until "things get serious" |
| Self-chat ONLY (no replies in other chats) | R2 | Filter requires `from === to === ownerNumber` after bug where user typing in any chat triggered NitsyClaw |

---

## 11. Known issues / debt

- **API keys exposed earlier in chat** — Anthropic, OpenAI, Supabase password. Rotate when convenient.
- **Vercel chat page (`/chat`)** uses plain Claude conversational mode — does NOT yet call NitsyClaw's tools. WhatsApp surface has full tool access; dashboard chat is text-only LLM.
- **Yahoo IMAP code exists but unused** — `yahoo-imap.ts` will silently return `[]` if env vars missing. Safe.
- **No QR alerting** — if bot's WhatsApp session ever drops, the QR code prints to `logs/bot.log` only. Need to manually scan. Could add a desktop toast notification in future.
- **Test pyramid out of date** — Vitest unit tests exist but haven't been re-run since session 1 changes; multi-account aggregator is untested.
- **mind.md hasn't been git-committed in a while** — push after this update.

---

## 12. Test pyramid (R15) — last verified session 1

- Unit tests: `packages/shared/test/*.test.ts` — every feature, utils, agent
- Integration: `apps/bot/test/router.integration.test.ts`
- E2E: `apps/dashboard/test/e2e/dashboard.spec.ts`
- CI gate: 70% lines / 65% branches

Status as of session 2: probably failing on multi-account adapter changes (no new tests added). TODO: write tests for `fetchAllEventsToday` + `fetchAllUnreadEmails`.

---

## 13. Session log

| Date | Session | Summary |
|---|---|---|
| 2026-04-25 | 0 | Initial scaffold (as OpenClaw). 120 ideas, Constitution v1.0, no code. |
| 2026-04-26 | 1 | Renamed → **NitsyClaw**. Stack locked. Monorepo. 10 P0 features. Tests. Constitution R13–R16. |
| 2026-04-27 (early hours) | 2a | Phase 1 GitHub push. Phase 2 Google Calendar (personal). Vercel dashboard deploy. /chat page. Cloud bot via Railway attempted — abandoned after 5+ hours of whatsapp-web.js + Puppeteer + Chromium fighting. |
| 2026-04-27 | 2b | Cancelled Railway. Bulletproofed local always-on (silent-launcher + broom). Renamed Vercel `nitsyclaw-dashboard` → `nitsyclaw`. Multi-account email/calendar: + Solar Harbour Workspace, + M365 Wattage. Yahoo skipped. All sources merged into morning brief + "what's on my plate". Self-chat-only WhatsApp filter fix. |
| 2026-04-28 | 3 | DB-not-configured fix (Vercel env corruption). Dashboard pages dark-themed. `/debug` page. Bot strict-mode fixes (subtype, regex, M365 auth). R20 added (Vercel runtime/maxDuration). Yahoo unwired. |
| 2026-04-28 | 4 | **Dashboard agent loop LIVE.** `/api/chat` runs full 10-tool agent. 4 strict-mode fixes for noUncheckedIndexedAccess (adapters, google-auth, route.ts, morning-brief). Smoke tests pass: plate, birthdays, reminders all hit tools. Final commit `7575aac`. |
| 2026-04-28 | 5 | **Same-page WhatsApp+dashboard.** `surface` column on messages, both surfaces persist + pull cross-surface history (last 20). Unified system prompt (`buildSystemPrompt`) so smart = answer general-knowledge Qs directly + use Anthropic server-side `web_search_20250305` for current info. New `GET /api/chat/history`. `/chat` page hydrates on mount. WhatsApp bot persists outbound (was inbound-only gap). NWP-Constitution-v1.2 codified to repo + project-root `CLAUDE.md` autoloader. Final commit `e54a971`. |
| 2026-04-28 | 5b | **Broom silent.** `NitsyClaw Broom` scheduled task no longer flashes a console window every 2 min. Now invokes `broom-silent.vbs` via `wscript.exe` (WshShell.Run vbHide). Heartbeat at `logs/broom-last-tick.txt`. Commit `0938425`. |
| 2026-04-28 | 5c | **WhatsApp restart-loop fixed.** Bot was receiving messages but never replying because broom every 2 min called `silent-launcher.ps1`, which `Get-Process node | Stop-Process -Force`'s ALL node processes (killing the bot mid-message). Fix: broom now calls new `launch-bot.ps1` (idempotent, bot-only, exits if alive). Removed dashboard check from broom (Vercel handles production dashboard). + `*add <desc>` Claude Code trigger for one-command feature requests. |
| 2026-04-28 | 5d | **Broom no longer commits suicide.** Its kill-stale-windows regex matched the path substring 'nitsyclaw' which appeared in the broom's own commandline — every tick it killed itself (PIDs 36968, 50212, 30940, etc. in broom.log). Narrowed regex to actual stale-launcher signatures (pnpm bot \| pnpm dashboard \| next dev \| tsx watch \| nuke-and-go) and added explicit exclusion for broom.ps1 / broom-silent.vbs / launch-bot.ps1 / silent-launcher.ps1 in the negation. Also restarted bot to clear stale wa-session connection (it was up but not receiving inbound). |

---

## 14. Session 4 (2026-04-28) — Dashboard agent-loop deploy completed

**Final commit:** `7575aac` — agent loop now LIVE on `https://nitsyclaw.vercel.app/api/chat`.

**What this session shipped:**
- `apps/dashboard/src/app/api/chat/route.ts` runs the same agent loop as the bot (10 tools, registerAllFeatures). Dashboard chat no longer deflects to WhatsApp.
- Response shape now includes `meta.rounds` and `meta.tools[]` so the chat UI can show what tools fired.

**Verified live (2026-04-28 ~09:50 UTC):**
- "whats on my plate today?" → `meta.tools=[{name:"whats_on_my_plate",success:true}]`, rounds=2
- "any birthdays this week or next?" → `meta.tools=[recall_memory ×3]`, rounds=3
- "how many reminders do I have?" → returns full tool list (model picks the right one when one exists)

**What it took (whack-a-mole on `noUncheckedIndexedAccess`):**
The dashboard tsconfig pulls bot files transitively via `04-morning-brief.ts`/`05-whats-on-my-plate.ts` dynamic imports of `apps/bot/src/adapters.ts`. Each TS error blocks the build. Fixes shipped:
- `apps/bot/src/adapters.ts:66` — added trailing `?? "ogg"` so `subtype` is `string` not `string|undefined`
- `apps/bot/src/google-auth.ts:45` — `if (m && m[1])` guard before `.toLowerCase()`
- `apps/dashboard/src/app/api/chat/route.ts:185` — `if (!last || last.role !== "user")` guard
- `packages/shared/src/features/04-morning-brief.ts:53` — extra `?? e.from` fallback

**Lessons added (extends §10 anti-patterns L7-L17 in HANDOFF-TO-CLAUDE-CODE.md):**
- **L18:** Dashboard tsc fails locally when `apps/dashboard/node_modules` is locked by the silent-launcher process. Use `npx tsc -p apps/bot/tsconfig.json` from project root to type-check bot in isolation, or just push and read Vercel logs via `vercel inspect <url> --logs`.
- **L19:** `vercel inspect <deployment-url> --logs` is the right tool to read build failures — fast, no token setup needed (CLI auth works once you've run `vercel whoami`).
- **L20:** Whack-a-mole is wasteful. Before pushing a fix for one TS error, grep the entire build path for sibling violations (`.split(...)[N].`, `match(...)?.[N]`, `[N].method`, `?? x.split(...)[N]`).

**Remaining tech debt (carry to next session):**
- `04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26` still dynamic-import `apps/bot/src/adapters.js`. Strict-mode bugs in bot still poison dashboard build. Clean fix: refactor those calls to go through `AgentDeps` so dashboard never sees `apps/bot/*`. Tonight = patch level. **Scheduled cleanup agent: trig_01XYHgVLJMMAVQQbBAFjr7Az fires 2026-05-12.**
- google-auth.ts has unused-but-fine standalone TS error (TS6059 rootDir + `redirect_uris[0]` already fixed). Bot tsconfig `include: ["test/**/*"]` should be excluded from `rootDir` or moved.
- API key rotation still pending.
- Vercel chat tests vs WhatsApp parity not yet automated.

---

## 15. Session 5 (2026-04-28) — Same-page WhatsApp + dashboard

**Final commit:** `e54a971` — both surfaces share conversation context and now answer general-knowledge questions (no more "go to WhatsApp" deflection).

**What this session shipped:**
- DB migration `0001_add_surface_to_messages.sql` — additive (default `'whatsapp'`) so legacy rows are safe. Applied via `packages/shared/scripts/apply-migration-0001.mjs`.
- `packages/shared/src/agent/history.ts` — `loadCrossSurfaceHistory(db, ownerHash, limit)`. Reads BOTH surfaces by `fromNumber=hashPhone(ownerPhone)`, decrypts safely (handles plaintext+AES mix), maps direction→role, returns oldest→newest.
- `packages/shared/src/agent/system-prompt.ts` — `buildSystemPrompt({surface})` is the single source of truth. Both surfaces import it. Tells the model to answer general-knowledge Qs directly, use tools for personal data, use `web_search` for current/real-time facts.
- `apps/bot/src/router.ts` — pulls cross-surface history before agent, persists outbound (`sendAndPersist` wrapper) for transcribe/receipt/agent replies, persists `reply_to_user` text too. Uses `buildSystemPrompt({surface:"whatsapp"})`.
- `apps/dashboard/src/app/api/chat/route.ts` — pulls cross-surface history (ignores client-supplied), persists user+assistant after agent. Uses `buildSystemPrompt({surface:"dashboard"})`.
- `apps/dashboard/src/app/api/chat/history/route.ts` — new GET endpoint for hydration.
- `apps/dashboard/src/app/chat/page.tsx` — `useEffect` on mount fetches history; "Loading conversation history..." pre-state.
- Both LLM call sites inject Anthropic server-side `web_search_20250305` (max_uses 5) so model can fetch current info without external API key. `web_research` local stub disabled in `registerAllFeatures()`.
- `CLAUDE.md` at project root (NWP autoloader per backlog 5.3 / NWP-v1.2 self-suggested home).
- Repo-tracked: `NWP-CONSTITUTION-v1.2.md`, `CLAUDE-CODE-BACKLOG.md`, `HANDOFF-TO-CLAUDE-CODE.md`.

**Verified live (2026-04-28 ~10:10 UTC, single deploy, no whack-a-mole):**
- "what is the capital of brazil?" → direct answer "Brasília", `tools=[]`, `historyLoaded: 8`. Model commented "Looks like you had quite a busy WhatsApp thread going this morning" — proves cross-surface awareness.
- "whats on my plate today?" → `whats_on_my_plate` fired, `historyLoaded: 10`.
- `GET /api/chat/history?limit=5` returns persisted dashboard pairs.

**Lessons L21+:**
- **L21:** Anthropic server-side `web_search_20250305` is the right web-search choice over Tavily/Exa/Brave for tool-use loops — no external API key, no infra, billing baked into Anthropic. Wire by appending to the `tools` array passed to `messages.create`. Tradeoff: no log of search queries (Anthropic-internal).
- **L22:** Cross-surface history works via `fromNumber = hashPhone(ownerPhone)` — same hash for both surfaces because the user is the same person. SHA-256 deterministic. No surface-specific filter needed; `recentMessages` already returns both surfaces when query doesn't filter by `surface`.
- **L23:** Always use the pooled `DATABASE_URL` (not `DATABASE_URL_DIRECT`) for migration scripts run from local laptop — direct host frequently DNS-unreachable on Supabase free tier.
- **L24:** Schema additive migrations with default values (`ADD COLUMN IF NOT EXISTS x text NOT NULL DEFAULT 'foo'`) backfill existing rows in milliseconds and don't break running services.
- **L25:** Run NWP Step 6 (pre-mortem) BEFORE coding — mitigations baked into design saved this session from another whack-a-mole. Pre-pushed gracefully-degraded paths (`safeDecrypt`, `loadCrossSurfaceHistory.catch(() => [])`, persist-failure-non-fatal) prevented runtime crashes.
- **L26:** Scheduled-task `-WindowStyle Hidden` is INSUFFICIENT when task `Logon Mode: Interactive only`. Windows renders the spawned window in the user session anyway. Two real fixes: (a) task config "Run whether logged on or not" (needs Windows password); (b) wrap script in `wscript.exe broom-silent.vbs` calling `WshShell.Run cmd, 0, False` — truly invisible, no password. Used (b) for `NitsyClaw Broom` task. Heartbeat at `logs/broom-last-tick.txt` for verification.
- **L27:** "Ensure backend files are up-to-date after every fix" is now standard discipline (not just session-end). Every code commit pairs with mind.md update in same push when behavior or infra changes. Constitution R4 already required this — L27 reaffirms cadence (every fix, not every session).
- **L28:** Watchdogs that "restart everything" are dangerous. The broom calling `silent-launcher.ps1` every 2 min (which `Stop-Process -Force` 'd ALL node) was killing the bot mid-message-processing — user's "hello" never got a reply because the handler never finished. Watchdogs must be SURGICAL: only restart what's actually dead, don't touch what's alive. Pattern: per-process idempotent launcher (`launch-bot.ps1`, `launch-dashboard.ps1`) called only when that specific process is missing.
- **L29:** Local dashboard isn't a broom responsibility. Vercel handles the production dashboard; local is dev-only. Watchdogs guard production-critical processes only.
- **L30:** Watchdog regex needs explicit self-exclusion. The broom's "kill stale NitsyClaw windows" regex `'pnpm bot|...|nitsyclaw'` matched the broom's own commandline (path contained "nitsyclaw") — broom killed itself every tick, spawning fresh + suiciding ad infinitum. Lesson: any process-killer must `-notmatch` its OWN script name AND its launcher's name. Better: narrow the positive regex to specific launcher signatures only, drop the catch-all path substring.
- **L31:** WhatsApp bot can stay "client ready" while the puppeteer/WhatsApp websocket has silently dropped — no `disconnected` event fires, but inbound messages stop arriving. Diagnostic: bot.log goes quiet (only newsletter/broadcast drops, no real chats). Fix: kill bot, relaunch via `launch-bot.ps1` for fresh wa-session connection. Future: add a periodic wa-session health probe that detects silent disconnects and triggers self-restart.

**Remaining tech debt (carry to next session):**
- Two `makeAnthropicLlm` impls (one in `apps/bot/src/adapters.ts`, one in dashboard route) — duplicated. Move to `packages/shared/` so server-tool injection is one-place.
- `noopWebSearch` in dashboard route is dead code (web_research no longer registered) — delete.
- `apps/dashboard/src/app/conversations/page.tsx` should display `surface` badge (whatsapp vs dashboard) on each row.
- Tests: no unit tests yet for `loadCrossSurfaceHistory` or `buildSystemPrompt`. Per R15 (NitsyClaw R15, the test pyramid), should land before next non-trivial feature.

---

## 16. Return prompt (updated for v1.2)

> You are working on the **NitsyClaw** project at `C:\Users\Nitesh\projects\NitsyClaw`.
> Before doing any work in this repo, in this exact order:
>
> 1. Read `mind.md` in full (this file).
> 2. Read `NitsyClaw-Constitution-v1.0.md` in full.
> 3. Read `PARKED-TASKS.md` to see what's pending and what trigger phrases activate which task.
> 4. Acknowledge NWP by emitting "NWP acknowledged" as the first line of your first substantive response.
> 5. Run the 7-step NWP loop.
> 6. **Default state:** NitsyClaw runs hidden in background. Don't open new visible PowerShell windows for the bot or dashboard — use `silent-launcher.ps1`. The broom auto-restarts every 2 min.
> 7. **Don't reach for cloud-deployed bot.** That path is officially abandoned (R14 superseded by local always-on per session 2 decisions).
> 8. **Don't try to add Yahoo via OAuth or app password unless user explicitly asks.** Yahoo is intentionally skipped.
> 9. Ask the user which feature, account, or module to work on next — do NOT assume.
>
> Do not write code, edit `apps/` or `packages/`, or change architecture without first verifying the change is consistent with R1–R16 + session 2 decisions in §10. If a proposed change conflicts, surface the conflict and propose either a workaround or a new superseding rule.
