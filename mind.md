# mind.md — NitsyClaw

> Living technical reference. Read at the start of every session before doing any work.
> Updated: 2026-05-01 (session 10 — stale WhatsApp watchdog)

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
| 2026-04-28 | 5e | **Feature-request capture pipeline.** New `feature_requests` table (migration 0002), new shared `request_feature` tool wired to BOTH surfaces via `registerAllFeatures({surface})`, system prompt updated to route "add feature X" / "I want NitsyClaw to do Y" → tool. **Daily CCR build agent scheduled** (`trig_01XiN9ZowcHufrXkcNzMkJbe`, cron `0 12 * * *` UTC = 22:00 Sydney) picks up pending rows, runs NWP 7 steps with safety gate, implements, pushes, notifies back via messages table. PARKED-TASKS.md retired (snapshot in deprecation note); `CLAUDE-CODE-BACKLOG.md` is now sole markdown backlog, `feature_requests` table is sole live queue. Manage routine: https://claude.ai/code/routines/trig_01XiN9ZowcHufrXkcNzMkJbe |
| 2026-04-28 | 5f | **Push notifications wired** so Nitesh isn't dependent on WhatsApp's flaky self-chat notification. Every bot WhatsApp send now ALSO POSTs to ntfy.sh topic (free, no signup, cross-device) — phone (ntfy app), PC (browser at `https://ntfy.sh/<topic>` or ntfy desktop), persistent inbox. Optional Windows-toast fallback via PowerShell when at the laptop. New `packages/shared/src/notify/index.ts` with `pushNotify(text, opts)`. Env: `NTFY_TOPIC=nitsyclaw-b3011652d4279674` + `WINDOWS_TOAST=true` added to .env.local. Best-effort: failures never block the WhatsApp send. |
| 2026-04-28 | 5g | **Windows toast actually working + email path investigated.** Original toast PowerShell broke on PS7+ ("Collection was modified" enumeration error) — fix: cast `@($tpl.GetElementsByTagName('text'))` to array before indexing. Also switched AppID from custom `'NitsyClaw'` (unregistered → silently dropped on Win11) to system AppID `'Microsoft.Windows.Computer'` so toasts surface in Action Center. ntfy.sh email forwarding via `Email:` header was tested but free tier returns HTTP 400 (anonymous email sending blocked). Path documented for future paid-tier upgrade. NOTIFY_EMAIL env var removed from .env.local since it currently no-ops. Email-channel TODO added: Microsoft Graph sendMail with new Outlook (`olk.exe`, no COM API) requires re-auth with `Mail.Send` scope. |
| 2026-04-28 | daily-build-agent-1 | **Daily build agent first run — DB unreachable.** Agent booted successfully (all 6 files read, NWP acknowledged). Attempted DB connection to query `feature_requests` table. Blocked: `DATABASE_URL` not set in CCR routine environment and no `.env.local` present on the cloud runner. Zero pending rows processed. **Action required:** add `DATABASE_URL` (pooled Supabase URL from `.env.local` on the laptop) to the CCR routine's environment variables at https://claude.ai/code/routines/trig_01XiN9ZowcHufrXkcNzMkJbe — same var name used locally. Also add `GITHUB_PAT` if the git proxy isn't sufficient for push. Once env is set, next scheduled run (or manual trigger) will process pending rows automatically. See L35 below. |
| 2026-04-28 | 5h | **Build agent unblocked (attempt 1).** Embedded DATABASE_URL + NTFY_TOPIC directly into the routine prompt as fallback so it works without UI env-var setup. Routine updated via RemoteTrigger PATCH `trig_01XiN9ZowcHufrXkcNzMkJbe`. |
| 2026-04-28 | daily-build-agent-2 | **Second run — CCR network firewall confirmed.** Outbound TCP to Supabase (5432, 6543) AND HTTPS 443 to ntfy.sh ALL blocked by CCR sandbox allowlist (HTTP 403 "Host not in allowlist"). Embedding URL is correct credential practice but irrelevant when TCP is firewalled. Three options: (A) Vercel API proxy, (B) migrate to laptop node-cron RECOMMENDED, (C) Supabase Edge Functions wrapper. See L36. |
| 2026-04-28 | 5i | **3 pending features implemented locally** (CCR firewall workaround). Voice mic on /chat (Web Speech API), `/addfeature <description>` shortcut on both surfaces, non-receipt image identification with what-do-you-want-to-do prompt. Verified `/addfeature` live on Vercel (created+rejected test row `847ee441`). DB rows ff3ca79f/96407890/29956dc5 marked `done` with implementation_notes + pr_url=`568f149`. ntfy pushes fired per feature + summary so Nitesh sees on phone. Bot restarted for new router.ts code (tsx watch may not detect deeply nested edits reliably — manual restart safer). |
| 2026-04-28 | 5j | **Voice OUT on /chat + voice picker.** Browser Web Speech API (free, instant, zero API call) reads NitsyClaw replies aloud after each `/api/chat` response. Dashboard top-bar gets 🔊 On/Off toggle (saved in localStorage) + voice picker that lists every device-installed voice, sorted with English-first. Click a voice to preview. iOS gets Apple voices including Siri-quality; desktop Chrome gets ~200 Google Cloud voices; Firefox uses OS voices. Markdown stripped before TTS so it doesn't read 'asterisk asterisk'. WhatsApp voice-out (sending audio messages instead of text) is a separate larger feature — defer. |
| 2026-04-29 | 5k | **Streaming on /chat with voice on first sentence.** New `POST /api/chat/stream` emits NDJSON events (`start`, `tool`, `tool_result`, `text` deltas, `done`) using Anthropic SDK `messages.stream()` for the final round. Tool rounds happen non-streamed (we need full tool_use blocks before continuing) but final text streams word-by-word. Client `page.tsx` reads the stream via `ReadableStream.getReader()`, appends deltas to the live assistant bubble, and calls `speak()` per sentence as soon as each terminator (`.`, `!`, `?`, `\n`) arrives — voice OUT begins ~1s after first sentence rather than waiting for full reply. `speak()` no longer cancels in-progress utterances; sentences queue naturally on `speechSynthesis`. New replies trigger `speechSynthesis.cancel()` at start of `send()`. `/addfeature` shortcut still instant via single `done` event. Plain Q&A streams from word 1 (verified live: "why is sky blue" → words flow). |
| 2026-04-29 | 5l | **Voice OUT robustness fixes.** iOS Safari was silently dropping speak() calls because audio context only "unlocks" with a speak() inside a user gesture; my streaming reader's speak() fired asynchronously after the click had ended, so it was muted on iOS. Three fixes: (a) primer utterance (volume=0, single space) speak() called synchronously inside the Send click handler before async fetch begins — unlocks the audio context for the rest of the session; (b) auto-pick best English voice on voices-loaded (en-AU default → en-AU → en-US default → en-US → en-* → any default → first), so users who never clicked the Voice picker still get audio; (c) `setTimeout(update, 250)` belt-and-suspenders for Chrome's async getVoices(). Plus diagnostic `console.log("[tts] queue: ... voice=...")` in speak() so user can open DevTools and verify. |
| 2026-04-29 | 5m | **Outlook calendar write (backlog Priority 3.1).** `schedule_call` tool now accepts `calendar: "google" \| "outlook"` (default `google`); destination persisted into confirmation payload. `resolve_confirmation` routes `create_calendar_event` via `ctx.deps.calendar.createOutlookEvent` when payload says outlook AND that method exists, else falls back to Google with a `fallback` field on the response (so the agent can tell the user). New `createMsEvent` + `graphPost` helper in `apps/bot/src/microsoft-graph.ts` (POST `/me/events`, attendees mapped to `emailAddress.address`, timezone-aware via `process.env.TIMEZONE` defaulting to Australia/Melbourne). Bot's `realCalendar` provides `createOutlookEvent`; dashboard's `noopCalendar` does not — Vercel can't reach `ms-token.json` on the laptop, so dashboard surface transparently falls back to Google. R26-clean: `microsoft-graph.ts` is imported only from `apps/bot/src/adapters.ts`, never from `packages/shared/*`. 3 new routing tests in `09-confirmation-rail.test.ts` (outlook→outlook, outlook+no-fn→google fallback, default→google). 92 of 100 vitest tests pass; the 8 pre-existing failures (router integration, agent-loop, env, maskPhone) are unchanged from before this commit. R38 added. |
| 2026-04-29 | 5n | **Defensive /chat streaming reader + JSON fallback.** User reported "voice in works but no reply text" on Android Chrome AND Desktop Chrome. Server-side both `/api/chat` and `/api/chat/stream` returned correct responses via curl (verified `Transfer-Encoding: chunked`, `application/x-ndjson`, valid NDJSON events). Bug not reproducible without DevTools access. Shipped defensive client fixes: (a) `setAssistantContent` helper does reverse-search for the last assistant entry instead of trusting `copy[length-1]` — guards against state-ordering races; (b) if the stream finishes with no text events AND no error event was shown, fall back to non-streaming `/api/chat` so user always sees *something* (both endpoints run the same agent loop, streaming is the optimisation); (c) per-event `console.log("[chat] event: ...")` so opening DevTools surfaces exactly what arrives; (d) HTTP-status check before `reader.getReader()` — surfaces 4xx/5xx as a clean Error bubble instead of silently iterating an HTML error body; (e) primer audio wrapped in outer try/catch (prior version only caught `speak()` itself; `cancel()` + constructor were unprotected). Commit `cdee64d`. R39 added (defensive streaming over silent-failure). |
| 2026-04-29 | 5o | **Manual 🔊 Read-aloud button on assistant bubbles (voice OUT reliable fallback).** After 5n, text reply was visible again, but voice OUT still silent on Chrome (Android + Desktop). Voice-picker preview worked → audio system fine → streaming TTS specifically broken. Diagnosis: Chrome's autoplay policy "expires" the user-gesture context during the async fetch+stream wait, even with our send-time primer (5l). Async `speak()` calls fired from inside the stream reader's microtasks were silently dropped. **Fix:** 🔊 button on every assistant bubble. Click → guaranteed user gesture → `speechSynthesis.cancel(); speak(m.content)` ALWAYS plays. Streaming auto-TTS still attempts (works for some users like me); the button is a 100%-reliable manual fallback. Commit `11d5eb6`. R40 added (every audio feature must have a user-gesture entry-point). |
| 2026-04-28 | daily-build-agent-2 | **Daily build agent second run — CCR sandbox network firewall confirmed.** pnpm install succeeded; DB query attempted. Root cause: outbound TCP to Supabase (ports 5432 and 6543, pooler + direct host) ALL time out. ntfy.sh HTTPS 443 also blocked (HTTP 403 "Host not in allowlist"). Not a credential problem — it is a network allowlist firewall in the CCR sandbox. Zero pending rows processed. See L36 for three fix options; Option B (migrate agent to laptop node-cron, already always-on) is recommended. |
| 2026-04-29 | daily-build-agent-3 | **Third run — Option B implemented.** CCR network firewall re-confirmed (ntfy 403, Vercel 403 with `x-deny-reason: host_not_allowed`, Supabase TCP timeout). pnpm install succeeded; all boots read fine. Implemented Option B: new `apps/bot/src/build-agent.ts` with `runDailyBuildAgent()` — queries pending feature_requests, posts ntfy push, sends WhatsApp self-message listing features with IDs + size tags. Wired into `apps/bot/src/scheduler.ts` cron `0 12 * * *`. Bot process runs on laptop with full network access (Supabase, ntfy, WhatsApp). CCR routine can remain for future if allowlist opens; laptop cron is now the reliable path. Zero pending features processed (DB unreachable from CCR). L37 added. |
| 2026-04-30 | daily-build-agent-4 | **Fourth run — CCR firewall unchanged; zero features processed.** pnpm install succeeded (node_modules absent, fresh install took ~46s). All 6 boot files read successfully (NWP acknowledged). DB connection: TCP timeout to aws-1-ap-northeast-1.pooler.supabase.com:6543 (same as runs 1-3). ntfy.sh: HTTP 403 "Host not in allowlist". Vercel: HTTP 403 "Host not in allowlist". All three external-network exit paths remain blocked. Git proxy (127.0.0.1:35523) operational — fetch + push work. No pending features implemented. Documented this run in mind.md + pushed via git proxy. The laptop node-cron (build-agent.ts, 12:00 UTC) is and will remain the only path for daily feature notification; CCR routine serves as a documentation/audit trail only. No new code changes this run. |
| 2026-05-01 | 6 | **Dashboard auth gate.** Added `apps/dashboard/src/middleware.ts` so dashboard pages and API routes require Basic auth before route handlers/server components expose private DB data. Production fails closed with HTTP 503 if `NITSYCLAW_DASHBOARD_PASSWORD` is missing; missing/invalid credentials return HTTP 401 with `WWW-Authenticate`. Static Next assets are excluded. Added pure auth helper + 7 unit tests. R41 added. |
| 2026-05-01 | 7 | **WhatsApp owner ID normalization.** Bot was ready but owner self-chat messages could be dropped because WhatsApp emitted `614...@c.us` while env used `+614...`. Added shared owner-ID normalization and regression tests. |
| 2026-05-01 | 8 | **WhatsApp fromMe self-chat gate.** Expanded the self-chat gate to accept owner-authored messages where WhatsApp uses a non-phone sender ID but `fromMe=true` and `to` is the owner number; normal chats/groups still drop. |
| 2026-05-01 | 9 | **WhatsApp mobile reply polish.** Fixed orphan `Yes` replies so they fall through to agent context instead of `No pending confirmations`; banned markdown tables on WhatsApp; cleaned mojibake from morning brief and plate text. |
| 2026-05-01 | 10 | **Stale WhatsApp watchdog.** WhatsApp stopped again while bot process was alive and `bot.log` was stale. Restarted bot manually, then taught `broom.ps1` to restart only the bot when `bot.log` is stale for 15 minutes. |

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
- google-auth.ts has unused-but-fine standalone TS error (`redirect_uris[0]` already fixed). Bot tsconfig no longer includes `test/**/*`; Vitest remains responsible for test files.
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
- **L32:** Windows toast via `[Windows.UI.Notifications]` PS API has TWO common-fail traps: (a) PowerShell 7+ returns lazy iterators from `GetElementsByTagName` — must cast `@(...)` before indexing, else "Collection was modified" runtime error; (b) custom AppIDs (`CreateToastNotifier('NitsyClaw')`) are silently dropped on Win11 because no Start Menu shortcut is registered — use a system AppID like `'Microsoft.Windows.Computer'` to surface toasts in Action Center without registration.
- **L33:** ntfy.sh free tier no longer allows anonymous email forwarding (`Email:` header → HTTP 400 "anonymous email sending is not allowed"). Email channel requires either ntfy paid + auth token, OR direct SMTP via Gmail App Password, OR Microsoft Graph sendMail with re-auth. Don't add the `Email:` header on free-tier POSTs — it rejects the WHOLE request, breaking the regular push too.
- **L34:** New Outlook for Windows (`olk.exe`, formerly Mona) does NOT expose Outlook.Application COM/OLE automation. Classic `OUTLOOK.EXE` had it; the new web-based Outlook does not. To send mail programmatically when user runs new Outlook: must use Microsoft Graph or SMTP, not COM.
- **L35:** CCR (Claude Code Routines) runs in an isolated cloud Linux environment. It does NOT inherit `.env.local` from the laptop. Any secrets the daily build agent needs (DATABASE_URL, GITHUB_PAT, ANTHROPIC_API_KEY, NTFY_TOPIC) must be explicitly added as env vars in the routine's settings at https://claude.ai/code/routines/trig_01XiN9ZowcHufrXkcNzMkJbe. The git proxy (local_proxy@127.0.0.1) handles GitHub push auth automatically — no GITHUB_PAT needed for git. But DATABASE_URL is mandatory for Postgres access.
- **L36:** CCR sandbox has an outbound network ALLOWLIST firewall — deeper than just missing env vars. Confirmed via `nc -zv` probes in daily-build-agent-2: ALL TCP to Supabase (pooler ports 5432+6543, direct host port 5432) times out. ntfy.sh HTTPS 443 also blocked (HTTP 403 "Host not in allowlist"). Embedding DATABASE_URL in the prompt is correct credential practice but irrelevant when TCP is firewalled. Three fix options: (A) expose thin Vercel API route (`/api/agent/pending-features`) as HTTP proxy for pending rows, since HTTPS to nitsyclaw.vercel.app MAY be in CCR's allowlist; (B) migrate build agent entirely to laptop node-cron (already always-on bot process, has full network access, can call Anthropic API directly) -- RECOMMENDED; (C) Supabase Edge Functions as HTTP wrapper. Option B is most pragmatic given always-on architecture.
- **L37:** When the CCR build-agent environment blocks all external HTTPS (Vercel, ntfy, Supabase) but the Edit tool is used to write new TypeScript, watch out for two encoding traps: (1) The Edit tool may store curly/smart quotes (U+201C/U+201D) instead of ASCII double-quotes inside code blocks, causing TS1127 "Invalid character" on every string literal — use Write to rewrite the whole file with raw ASCII if the Edit inserts bad quotes. (2) The existing scheduler.ts file had mojibake em-dash sequences (`\xc3\xa2\xe2\x82\xac...`) in comments from an old Windows editor — harmless for tsc but confusing in diffs; replace with ASCII hyphen `--` on next touch. Both traps are benign at runtime but block tsc and therefore Vercel deploys.
- **L38:** The local untracked `apps/dashboard/node_modules` reparse point can block `pnpm -r build` with `EACCES: permission denied, realpath ...\apps\dashboard\node_modules`. Do not delete it casually because it is untracked local state; either clean it deliberately or verify via Vercel build. Targeted Vitest may need to run outside the sandbox because esbuild process spawn can hit `EPERM`.
- **L39:** WhatsApp owner checks must normalize both env phone numbers and WhatsApp IDs to digits before comparison. `whatsapp-web.js` can emit `614...@c.us` while `.env.local` stores `+614...`; raw string comparison silently drops valid self-chat messages.
- **L40:** WhatsApp self-chat messages may be delivered as owner-authored `fromMe=true` events where `from` is a non-phone LID but `to` is the owner phone. Accept that shape only when `to` normalizes to the owner; do not relax incoming contact/group messages.
- **L41:** Never let a naked `yes`/`no` die in the confirmation rail unless a pending confirmation actually exists. If there is no pending confirmation, pass it to the agent so conversation context can resolve it. Also keep WhatsApp output phone-shaped: no markdown tables, no mojibake, compact bullets.
- **L42:** A live bot process is not a live WhatsApp client. If `logs/bot.log` stops changing while `broom-last-tick.txt` keeps updating, treat the bot as stale and restart only the bot process. This is less risky than all-node restarts and fixes the repeated alive-but-silent WhatsApp Web state.

**Remaining tech debt (carry to next session):**
- Two `makeAnthropicLlm` impls (one in `apps/bot/src/adapters.ts`, one in dashboard route) — duplicated. Move to `packages/shared/` so server-tool injection is one-place.
- `noopWebSearch` in dashboard route is dead code (web_research no longer registered) — delete.
- `apps/dashboard/src/app/conversations/page.tsx` should display `surface` badge (whatsapp vs dashboard) on each row.
- Tests: no unit tests yet for `loadCrossSurfaceHistory` or `buildSystemPrompt`. Per R15 (NitsyClaw R15, the test pyramid), should land before next non-trivial feature.
- **Daily build agent notification only (L37).** Bot cron now notifies Nitesh at 12:00 UTC of pending features via WhatsApp + ntfy. Auto-implementation still manual (open Claude Code + `*nwp`). Full auto-impl would require bot to spawn `claude -p` subprocess or a Vercel proxy — deferred.

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

---

## 17. Session 6 (2026-05-01) — Dashboard auth gate

**Goal:** Stop the public Vercel dashboard from exposing private data before any product polish.

**What changed:**
- Added `apps/dashboard/src/lib/dashboard-auth.ts` with pure Basic-auth parsing and fail-closed production checks.
- Added `apps/dashboard/src/lib/dashboard-auth.test.ts` covering valid credentials, missing credentials, invalid credentials, local-dev fallback, and production fail-closed behavior.
- Added `apps/dashboard/src/middleware.ts` to protect all dashboard pages and API routes except static Next assets.
- Added `NITSYCLAW_DASHBOARD_USER` and `NITSYCLAW_DASHBOARD_PASSWORD` placeholders to `.env.local.example`.
- Added Constitution R41 to make authenticated dashboard access a project invariant.

**Verification:**
- `.\node_modules\.bin\vitest.cmd run apps/dashboard/src/lib/dashboard-auth.test.ts` passed: 7 tests.
- `npm run build` is blocked locally by existing untracked `apps/dashboard/node_modules` reparse point resolving with `EACCES`; same failure occurs outside the sandbox. This is local workspace state, not a TypeScript error from the auth code.

**Deployment note:**
- Set `NITSYCLAW_DASHBOARD_PASSWORD` in Vercel production before or with this deploy. If it is missing, production intentionally returns HTTP 503 instead of exposing private data.

---

## 18. Session 7 (2026-05-01) — WhatsApp owner ID normalization

**Goal:** Restore WhatsApp replies when the bot is connected but owner self-chat messages are silently dropped.

**What changed:**
- Added `apps/bot/src/whatsapp-identity.ts` with shared owner-ID normalization and self-chat comparison.
- Updated `apps/bot/src/wwebjs-client.ts` so `+614...` env values match WhatsApp IDs such as `614...@c.us`.
- Added `apps/bot/test/whatsapp-identity.test.ts` covering the exact plus-prefix mismatch and non-self-chat rejection.
- Removed `test/**/*` from `apps/bot/tsconfig.json` so `tsc -p apps/bot/tsconfig.json --noEmit` type-checks source files instead of failing on tests outside `rootDir`; Vitest still owns test execution.

**Verification:**
- `.\node_modules\.bin\vitest.cmd run apps/bot/test/whatsapp-identity.test.ts` passed: 3 tests.

**Operational note:**
- Restart the local bot after this change; `tsx watch` may not reliably pick up newly added files inside the hidden always-on process.

---

## 19. Session 8 (2026-05-01) — WhatsApp fromMe self-chat gate

**Goal:** Cover WhatsApp Web self-chat events where the authored message uses a non-phone sender ID.

**What changed:**
- `isOwnerSelfChat` now accepts `fromMe=true` plus `to=owner` after normalization.
- The gate still rejects owner-authored messages sent to any other chat and rejects incoming non-owner chats/groups.
- Added regression coverage for the LID-style `from` case.

**Verification:**
- `.\node_modules\.bin\vitest.cmd run apps/bot/test/whatsapp-identity.test.ts` passes after this change.

---

## 20. Session 9 (2026-05-01) — WhatsApp mobile reply polish

**Goal:** Fix the UX problems visible in the WhatsApp desktop/mobile screenshots.

**What changed:**
- `apps/bot/src/router.ts` now only short-circuits `yes`/`no` when a real pending confirmation exists. If no pending confirmation exists, the message continues through the normal agent flow with history.
- `packages/shared/src/agent/system-prompt.ts` now tells WhatsApp replies to avoid markdown tables and to use compact mobile-readable text.
- `packages/shared/src/agent/system-prompt.ts` also tells the agent to use `pin_memory` immediately for save/remember/pin requests instead of asking unsupported yes/no followups.
- `packages/shared/src/features/04-morning-brief.ts` and `05-whats-on-my-plate.ts` now use ASCII labels/bullets instead of corrupted emoji bytes.
- `packages/shared/test/helpers.ts` now initializes `audit_log` and `feature_requests` fake tables so router integration tests cover the current agent audit path.

**Verification:**
- `.\node_modules\.bin\vitest.cmd run apps/bot/test/router.integration.test.ts apps/bot/test/whatsapp-identity.test.ts` passed: 10 tests.
- Mojibake scan under `packages/shared/src` returned no matches for the known corrupted byte patterns.

---

## 21. Session 10 (2026-05-01) — Stale WhatsApp watchdog

**Goal:** Stop requiring manual intervention when WhatsApp Web goes alive-but-silent.

**What happened:**
- The bot process was alive, but `logs/bot.log` had not changed since 21:06 while `logs/broom-last-tick.txt` kept updating.
- Manual bot-only restart restored intake immediately; fresh log showed `WhatsApp ready` and accepted owner messages.

**What changed:**
- `broom.ps1` now checks `logs/bot.log` age when the bot process exists.
- If `bot.log` is older than 15 minutes, broom stops only matching bot node processes and calls `launch-bot.ps1`.
- Dashboard and unrelated Node processes are not touched.

**Verification:**
- Manual bot-only restart produced `[boot] WhatsApp ready` and accepted `Hi`/owner inbound messages.
- `broom.ps1` syntax checked with PowerShell parser after edit.

---

## 22. Session 11 (2026-05-01) — WhatsApp self-healing client

**Goal:** Make the WhatsApp bot recover from client-level dead states instead of relying only on external stale-log detection.

**What changed:**
- Added `apps/bot/src/whatsapp-health.ts` with reusable health-state, restart-threshold, and timeout helpers.
- Updated `apps/bot/src/wwebjs-client.ts` so the wrapper owns recovery:
  - starts a periodic active health probe after `ready`;
  - requires `CONNECTED` plus a successful `sendPresenceAvailable()` call;
  - restarts the underlying whatsapp-web.js client after repeated probe failures;
  - restarts on `disconnected`, `auth_failure`, or failed outbound send;
  - preserves registered router handlers across client recreation.
- Added `apps/bot/src/types/qrcode-terminal.d.ts` so bot source type-checking no longer depends on missing third-party types.
- Added `apps/bot/test/whatsapp-health.test.ts` covering state classification and restart threshold logic.
- Replaced legacy setup/watchdog paths so future Windows setup uses `broom.ps1` + `launch-bot.ps1` only and never calls `nuke-and-go.ps1` for bot supervision.
- Updated `launch-bot.ps1` to run production `pnpm --filter @nitsyclaw/bot start` instead of dev/watch mode.
- Updated broom process matching to recognize both bot start/dev command shapes and removed recurring visible-window killing because it could kill healthy child processes.
- Kept the WhatsApp health probe timer ref-held so production `start` mode remains alive after `ready`; dev/watch previously masked that event-loop lifetime issue.

**Agent critique incorporated:**
- Supervisor critique: one supervisor only, avoid broad dashboard/nuke restarts, keep bot-only recovery.
- WhatsApp client critique: add active liveness probe and recreate the client on disconnect/repeated probe failure.
- Product/ops critique: next reliability layer should be a Supabase heartbeat, dashboard health banner, and out-of-band email alert.

**Verification:**
- `.\node_modules\.bin\vitest.cmd run apps/bot/test/whatsapp-health.test.ts apps/bot/test/whatsapp-identity.test.ts` passed: 8 tests.
- `setup-always-on.ps1` and `watchdog.ps1` parsed successfully with the PowerShell parser.
- `broom.ps1`, `launch-bot.ps1`, `setup-always-on.ps1`, and `watchdog.ps1` parsed successfully with the PowerShell parser after supervisor hardening.
- `npm run build` remains blocked by existing local dashboard dependency state: `next` is not recognized under `apps/dashboard`.
- `npx tsc -p apps/bot/tsconfig.json --noEmit` remains blocked by existing repo config/type issues (`rootDir` includes shared sources and existing `router.ts` `rawText` mismatch); the new `wwebjs-client.ts` errors from this change were fixed.
