# Session log — 2026-04-28 → 2026-04-29 (overnight Melbourne)

> Layman-friendly summary of what got built. Readable on phone, plain English.
> For the technical detail, see `mind.md` rows 5–5o and `NitsyClaw-Constitution-v1.0.md` R17–R40.

## What you can do now (capabilities)

### Talk to NitsyClaw, anywhere
- **WhatsApp self-chat** on phone — text, voice notes, photos, receipts
- **Web dashboard** at https://nitsyclaw.vercel.app/chat — type or speak via mic; it speaks back
- **Both share memory** — start a thread on WhatsApp, continue on web. NitsyClaw remembers everything across both.

### What it knows / answers
- General knowledge (capital cities, recipes, advice, math, code) — answers directly
- Live web search for current info (news, weather, prices, sports scores) — built into Anthropic
- Your reminders, calendar, expenses, memory notes
- Your unread emails across personal Gmail + Solar Harbour Workspace + Wattage M365
- Anything you previously told it ("remember when I…")

### What it can DO
- Set reminders ("remind me tomorrow 7pm to call Mum")
- Recurring reminders ("every Monday 9am")
- Log expenses from receipt photos (auto-categorised)
- Identify any non-receipt photo and ask what to do
- Schedule calendar events on Google (personal) OR Outlook/Wattage M365 — say "schedule on outlook" / "wattage calendar" and it routes there
- Search the web and summarise
- Save random thoughts to long-term memory
- Recall things from memory ("what did I save about X?")
- Ask y/n confirmation before destructive actions

### Notifications follow you across devices
- **ntfy app on phone** — push within 1–2 sec of every reply (topic: `nitsyclaw-b3011652d4279674`)
- **ntfy in browser or desktop app** — same channel, on PC
- **Windows toast** — pops in Action Center on this laptop (now actually working — 3 fixes shipped)
- **WhatsApp self-chat** — the message itself (notifications there are flaky, hence the others)

### Voice
- **Mic button on /chat** — tap, speak, words land in input box (Chrome/Edge/Safari)
- **Voice out** — NitsyClaw reads its replies aloud, sentence-by-sentence as it streams (doesn't wait for full reply)
- **Voice picker** — tap "Voice" button to choose any voice your device has
- 🔊/🔇 toggle to mute when you want quiet
- iOS Safari now works after primer fix (was being silently blocked by audio-context rules)

### Speed
- Plain Q&A: first word in 1–2 sec, voice starts on first sentence
- Tool questions ("what's on my plate"): 3–10 sec while it fetches data, then streams
- Mic and voice out: instant (browser-local, no API call)

### Asking for new features
- Type **`/addfeature <description>`** — works on WhatsApp AND dashboard, instant queue confirmation
- Or just say "add a feature: X" naturally — picked up by the request_feature tool
- Queued features sit in a Postgres table waiting to be built

### Always-on infrastructure
- Bot runs hidden on PC, auto-starts at Windows login
- Watchdog quietly restarts every 2 min if the bot crashes — no more 2-minute black-screen flashes
- Heartbeat file you can check to confirm watchdog is alive (`logs/broom-last-tick.txt`)
- Cloud dashboard on Vercel — runs even when laptop is off

## What got fixed/built this session (highlights)

### 2026-05-05 gold hardening addendum

- Dashboard chat, streaming chat, health, data export/delete, and Spotify integration paths now return safe user-facing failures instead of raw internal/provider/DB exception text.
- WhatsApp bot failure paths now log raw errors server-side and reply with short safe messages.
- Dashboard login lockout keys are bounded and normalized before durable Postgres storage.
- Vercel/Docker deploy contexts now explicitly exclude local OAuth credentials/tokens and WhatsApp session state, with regression coverage.
- Current verification before the final post-change release gate: targeted tests, dashboard/bot/shared typecheck, and lint passed.

### 2026-05-05 operator command addendum

- Added `/command` as the first real operator console.
- It can run direct commands into `/api/chat` and convert rough intent into Feature, Bug, Location, and Build commands.
- Added aggressive presets for Desktop Gateway, Codex Factory, Skill Store, Self-Healing, War Room, and Queue Push.
- Added navigation and Playwright coverage.
- The page degrades fast if telemetry is slow, instead of blocking the command path.

### 2026-05-05 operator mission queue addendum

- Added a top-20 operator mission catalog for the next serious NitsyClaw build tracks.
- Added `/api/operator/jobs` so `/command` can queue one mission or all 20 into the durable `feature_requests` ledger.
- Added dedupe keys so repeated overnight launches do not flood the backlog with duplicates.
- Added mission count and operator program visibility to `/command`.
- Avoided a new production DB migration in this pass; this uses the existing feature queue safely.

### 2026-05-05 red-team and next-50 addendum

- Added the Next 50 roadmap as executable operator queue items, separate from the top-20 mission catalog.
- Added `queue_next_50` to `/api/operator/jobs` and "Queue Next 50" to `/command`.
- Added automatic POST-route discovery coverage so new dashboard mutating APIs cannot skip same-origin protection unnoticed.
- Test-driven faults found and fixed: accidental 51-item roadmap, missing `queue_next_50` validation, fragile TypeScript narrowing, and too-terse roadmap labels.

### 2026-05-05 local operator runner addendum

- Added the local laptop runner for queue execution: `pnpm operator:next`, `pnpm operator:claim`, and `pnpm operator:reject-unsafe`.
- Runner default is dry-run, so previewing never mutates queue state.
- Runner selects the highest-severity oldest pending item, creates a verification plan, and rejects unsafe work instead of executing it.
- `/command` now shows the local runner commands.
- Verified `pnpm operator:next` against the real queue; it selected Self-Healing Core and printed the full verification gate.

### 2026-05-05 observable self-healing watchdog addendum

- Claimed `[Reliability] Self-Healing Core` from the production queue.
- Added `pnpm watchdog:heartbeat` and `scripts/watchdog-heartbeat.ts`.
- `broom.ps1` now publishes a non-blocking `local-watchdog` heartbeat on tick, bot-dead recovery, and restart recovery.
- `/health` now shows whether the local watchdog is fresh or stale.
- Verified with focused tests, a dry-run heartbeat, a real DB heartbeat write, and full `pnpm run release:preflight`.

### 2026-05-05 rollback gate addendum

- Added a tested rollback helper: `scripts/vercel-rollback.ps1`.
- Added `docs/rollback/production-rollback.md` with current deployment, previous deployment, dry-run rollback, apply rollback, and DB rollback note.
- Review agents found and forced fixes for rollback root resolution, alias coverage, DB rollback specificity, watchdog overwrite race, env fallback, and local path privacy.
- Rollback now restores both `nitsyclaw.vercel.app` and `nitsyclaw-dashboard.vercel.app`.

### 2026-05-05 post-deploy hardening addendum

- Second-pass review agents found deploy blockers after production was live: broken `bot:loop`, stale rollback manifest, private-history web-search exposure, non-atomic data deletion, deploy-doc drift, Docker lockfile drift, preflight remote leak, missing Windows CI, and weak watchdog proof after restart.
- Fixed the P0/P1 items in code/docs/tests.
- New safety shape:
  - dashboard chat no longer injects Anthropic server-side web search into private-history model calls,
  - data deletion is transactional and audited,
  - `DELETE EVERYTHING` requires current password plus export snapshot ID,
  - rollback helper verifies Vercel JSON state and primary alias health before moving all aliases,
  - CI checks Windows PowerShell scripts.
- Post-deploy review found and fixed four P1s:
  - delete-everything now purges all audit rows and leaves only a minimal tombstone row,
  - delete-everything requires a signed session-bound export proof, not a forgeable timestamp,
  - global login failure tracking no longer lets strangers lock out correct owner credentials,
  - rollback docs now require live Vercel inspect/ls output instead of hard-coded current deploy URLs that go stale on the next deploy.

1. **WhatsApp bot was crashing on every message** — silly bug in self-chat filter (`from` variable not declared). Fixed.
2. **Same-page across surfaces** — dashboard chat used to deflect "go to WhatsApp" because of version mismatch. Now both run the same agent, share memory, see each other's conversations.
3. **Smart prompt** — model now answers general knowledge directly instead of saying "I can't help with that". Real web search built in.
4. **The 2-minute black-screen flashes** on your monitor — gone. The watchdog now uses a truly invisible launcher.
5. **The bot was killing itself** every 2 minutes (the watchdog was telling a launcher that murdered all node processes). Fixed: surgical watchdog only restarts what's dead.
6. **The watchdog was killing itself** every 2 minutes (regex matched its own filename). Fixed: explicit self-exclusion.
7. **Push notifications** via ntfy — phone + PC + browser. Cross-device notifications you don't miss.
8. **Windows toast was broken** silently — PowerShell-7 enumeration bug + unregistered AppID. Both fixed.
9. **Voice mic** on /chat — tap + speak + transcript fills input.
10. **`/addfeature` shortcut** — instant feature queueing on both surfaces.
11. **Non-receipt image identification** — bot now describes any photo and asks what to do, instead of "couldn't read receipt".
12. **Voice out** with picker on /chat — NitsyClaw speaks aloud in your chosen voice.
13. **Streaming responses** — words appear as the model writes them, voice starts on first sentence.
14. **iOS Safari voice fix** — was silently blocked by audio-context rules; primer utterance unlocks it.
15. **Daily build agent** scheduled to auto-process queued features (currently blocked by CCR firewall — see below).
16. **Outlook calendar WRITE** (early morning 2026-04-29) — `schedule_call` now accepts `calendar: google | outlook`. Says "schedule with Sarah on outlook for tomorrow 3pm" → confirmation rail → reply 'y' → event created in Wattage M365. Dashboard surface (Vercel) silently falls back to Google when outlook is requested, since it can't reach the laptop's `ms-token.json`. R38 codified.
17. **/chat "no reply text" defensive fix** (2026-04-29) — user reported their message bubble appears but no reply on Android Chrome AND Desktop Chrome. Server endpoints all healthy (verified via curl). Couldn't reproduce without DevTools, so shipped client-side guards: HTTP-status check, reverse-search for assistant message slot, per-event console logs (`[chat] event: ...` visible in browser DevTools), and an automatic fallback to non-streaming `/api/chat` when the stream produces zero text. So even if streaming silently fails on a network/proxy quirk, the user always sees a reply or an Error bubble. R39 codified.
18. **🔊 Read-aloud button on every assistant bubble** (2026-04-29) — text reply now arrived but voice OUT still silent on Chrome. Voice-picker preview worked → audio fine → streaming auto-TTS specifically blocked by Chrome's autoplay policy expiring the gesture context during the async fetch+stream wait. Fix: a small 🔊 button appears next to every grey reply bubble. Tap it → speaks that reply. Always works because the click IS a fresh user gesture. Streaming auto-speak still attempts in the background; the button is the 100%-reliable manual fallback. R40 codified ("every audio feature must have a user-gesture entry-point").

## What's NOT yet working (open items)

- **Auto-build agent** — Anthropic's cloud sandbox firewalls the database AND ntfy. So queued `/addfeature` requests can't auto-implement themselves yet. Workaround: when you're online with Claude Code on the laptop, I process the queue. Real fix: migrate the build agent to the laptop's always-on cron (~1–2 hr next session).
- ~~**Outlook calendar WRITE**~~ — ✅ DONE 2026-04-29 (commit `6334c73`). Bot can now create events in Wattage M365 via `schedule_call` with `calendar: outlook`. Solar Harbour Workspace as a third destination is still pending (would slot in via the same pattern with the SH OAuth token).
- **Email channel** — ntfy works for push; actual emails to your Outlook inbox aren't wired yet. Three viable paths documented (Microsoft Graph sendMail recommended).
- **WhatsApp voice replies** — bot replies in text, not audio messages. Not started.
- **Yahoo email** — intentionally skipped (paywall).
- **Tool indicators in /chat streaming** — backend emits `{type:"tool"}` events, frontend ignores them visually. ~20 min to add "Looking up your reminders…" badges.
- **API key rotation** — Anthropic, OpenAI, Supabase password were pasted in chat earlier. Rotate when convenient.
- **Tests** — sessions 2–5 added a lot of code; coverage drift.

## Where the work lives

| Thing | Where |
|---|---|
| Live dashboard | https://nitsyclaw.vercel.app |
| GitHub repo | https://github.com/nitesh999-cmd/nitsyclaw |
| Database | Supabase Postgres |
| Bot | Hidden process on this PC (PID changes; check `logs/broom-last-tick.txt`) |
| ntfy topic | `nitsyclaw-b3011652d4279674` (already on your phone) |
| Scheduled agents | https://claude.ai/code/routines |
| Living technical reference | `mind.md` in repo root |
| Immutable rules | `NitsyClaw-Constitution-v1.0.md` in repo root |
| Open backlog | `CLAUDE-CODE-BACKLOG.md` in repo root |
| NWP boot rules | `NWP-CONSTITUTION-v1.2.md` in repo root |
| Auto-loader for new sessions | `CLAUDE.md` in repo root |

## To continue from anywhere

- **Phone or any browser** → https://nitsyclaw.vercel.app/chat (full agent, voice in/out, cross-surface memory)
- **Phone via WhatsApp** → always works
- **Different desktop / VS Code** → install Claude Code, `cd` to a clone of the repo, run `claude`. New session auto-loads everything via `CLAUDE.md`.
- **Phone GitHub app** → read `mind.md` and this file directly to recall what was done

## Counts

- **Commits this session:** ~28 (from `89056d1` "fix WhatsApp self-chat bug" through `11d5eb6` "Read-aloud button")
- **Constitution rules added:** R17 → R40 (24 new rules)
- **mind.md sub-rows added:** 5 → 5o (15 sub-sessions)
- **Lessons added:** L21 → L36 (16 lessons)
- **Features implemented:** 5 (voice in, /addfeature, non-receipt image ID, voice out + streaming, Outlook calendar write)
- **Daily ntfy pushes confirmed working:** ~10
- **Scheduled cloud agents:** 2 (May 12 refactor + daily build agent currently firewalled)

## My recommendation for tomorrow

1. **Use it for a real day** — morning brief at 7am, ask it stuff via WhatsApp + dashboard, dictate notes via mic, send a receipt photo. Real usage surfaces real gaps.
2. **Then migrate the build agent to the laptop** (1–2 hr) so queued features auto-implement going forward.
3. **Then everything else** — email channel, tool indicators, tests, key rotation. (Outlook write is done as of `6334c73`.) All in the backlog file.

Sleep well.

## 2026-05-08 WhatsApp reliability update

- Dashboard work was parked; WhatsApp became the focus.
- Evidence: local bot was connected, but many owner-authored events were dropped as `not self-chat fromMe=true`.
- Fixed the self-chat guard to use WhatsApp chat id as the reliable owner self-chat boundary.
- Fixed watchdog heartbeat env loading for scheduled/background contexts.
- Restarted only the local bot process tree via `launch-bot.ps1`.
- Fresh local proof: `logs/whatsapp-health-last-ok.txt` wrote `2026-05-08T12:46:28.504Z READY`.
- Follow-up fix: watchdog now loads the external bot secret root (`~/.nitsyclaw/secrets/.env.local`), which is where the real local DB env lives.
- Real `pnpm run watchdog:heartbeat` now succeeds.
- Final proof: `pnpm run release:preflight` passed, and WhatsApp health wrote `2026-05-08T12:50:28.536Z CONNECTED`.

## 2026-05-08 WhatsApp live DB fix

- User reported WhatsApp still not working.
- Evidence: bot received the message but failed while inserting/selecting `command_jobs`.
- Root cause: live DB had not applied the existing command-job migrations.
- Applied pending Drizzle migrations, verified `command_jobs` table exists, and verified a rolled-back live command-job insert path.
- Restarted the local bot; health wrote `2026-05-08T13:12:53.018Z CONNECTED`.
- Focused verification passed: `pnpm exec vitest run packages/shared/test/24-command-jobs.test.ts apps/bot/test/router.integration.test.ts apps/bot/test/whatsapp-identity.test.ts wwebjs-client-regression.test.ts`.

## 2026-05-09 WhatsApp silent-failure hardening

- User confirmed a real `hi` message worked.
- Added safe fallback reply from the WhatsApp client when owner/self-chat message handling crashes after intake.
- This means DB/AI/tool failures should no longer look like WhatsApp ignored the user.
- Verification passed: `pnpm exec vitest run wwebjs-client-regression.test.ts apps/bot/test/whatsapp-identity.test.ts`, `pnpm --filter @nitsyclaw/bot typecheck`, and `pnpm --filter @nitsyclaw/bot build`.

## 2026-05-09 Pending integration features batch

- User asked to add all pending features.
- Implemented the safe integration-router layer rather than pretending provider-heavy features are live.
- Added safe request tools for email connection, calendar connection, Spotify music, contacts/birthdays, and fuel prices.
- Expanded integration capability truth table and dashboard Integrations page.
- Verification passed: focused integration tests and `pnpm -r typecheck`.

## 2026-05-09 WhatsApp feature-status truth fix

- User screenshot showed WhatsApp saying "Nothing has been shipped yet" and telling Nitesh to open Claude Code/run `*nwp`.
- Root cause: the agent had a feature-write tool but no DB-backed feature-status read tool, so natural queue-status questions could be answered from stale context.
- Added `list_feature_queue_status`, expanded natural "pending features" detection, and removed user-facing "open Claude Code" wording from build-agent replies.
- Focused verification passed: feature-request, shortcut, router integration, system-prompt, and tool-registry tests.

## 2026-05-09 WhatsApp manual-workflow wording guard

- User confirmed the queue answer now showed live counts, but the model still ended with "Run *nwp in Claude Code".
- Added a reply-safety sanitizer so `reply_to_user` and router persistence strip manual Claude/Codex/OpenClaw/nwp instructions before WhatsApp sends them.
- Added system-prompt wording that forbids telling the user to manually run the build workflow from WhatsApp.
- Focused verification passed: reply tool, system prompt, router integration, and tool registry tests.

## 2026-05-09 WhatsApp feature queue brain

- Live DB check showed 95 pending queue items and recent shipped rows were visible.
- Added a deterministic queue summary layer for WhatsApp and the agent tool:
  - pending count,
  - recently shipped items,
  - best next safe build,
  - quick code-only wins,
  - setup-heavy OAuth/provider items,
  - grouped big batches.
- Added direct WhatsApp shortcut handling for `next moves`, `what next`, and `what should we build next`.
- This avoids stale model guesses and avoids telling Nitesh to manually run local workflow commands from WhatsApp.
- Focused verification passed: queue summary, feature-status tool, shortcut parser, and router integration tests.

## 2026-05-09 WhatsApp loop-breaker hardening

- The live queue brain surfaced a P0 loop-breaker incident as the best next safe build.
- Root cause found: send-burst protection permanently paused WhatsApp replies, which is too harsh for legitimate multi-message voice/document flows.
- Changed send-burst trips to a timed cooldown that auto-resets; true echo-loop matches still require manual reset.
- Loop-breaker incidents now include reset timing, safer notification wording, and deduped P0 bug queueing by incident type.
- Focused verification passed: loop-breaker and router integration tests.

## 2026-05-09 Location/memory quality control

- Added direct WhatsApp checks for `where am I?`, `location status`, and `what location are you using`.
- The reply now states the exact weather/default location source.
- Expired travel locations are reported as ignored instead of silently influencing later weather answers.
- This targets the earlier Sydney-vs-Melbourne failure mode without pretending WhatsApp can read real GPS.

## 2026-05-09 WhatsApp voice replay regression fix

- User screenshot showed a voice-flow backend error followed by `hear my last message` being treated as an approval-gated action.
- Root cause: the older loop-breaker pause caused the backend failure, and the command intent gate treated `message` wording as risky external sending.
- Stored voice transcripts on the original inbound message row, keeping them available to cross-surface history.
- Added a deterministic WhatsApp shortcut for `hear/read/repeat my last message` and `hear it`, skipping approval gates and ignoring confirmation noise like `approved`.
- Focused verification passed: personal PA intent tests and WhatsApp router integration tests.

## 2026-05-09 Non-English voice command routing fix

- User screenshot showed a Telugu voice note was transcribed, then stopped with `What outcome do you want from this?`.
- Root cause: voice transcripts were still passed through the English keyword-based clarification gate before the multilingual agent saw them.
- Changed command jobs so voice transcripts can pass to the agent when they are safe-but-unclear, while still approval-gating risky actions like sending messages, calls, payments, and bookings.
- Added router coverage proving a Telugu voice transcript reaches the agent and does not return the generic clarification prompt.
- Focused verification passed: command-job, personal PA intent, router integration, and bot typecheck.
