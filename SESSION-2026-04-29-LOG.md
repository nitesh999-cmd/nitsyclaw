# Session log — 2026-04-28 → 2026-04-29 (overnight Melbourne)

> Layman-friendly summary of what got built. Readable on phone, plain English.
> For the technical detail, see `mind.md` rows 5–5l and `NitsyClaw-Constitution-v1.0.md` R17–R37.

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
- Schedule calendar events (Google calendars only — Outlook write is open)
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

## What's NOT yet working (open items)

- **Auto-build agent** — Anthropic's cloud sandbox firewalls the database AND ntfy. So queued `/addfeature` requests can't auto-implement themselves yet. Workaround: when you're online with Claude Code on the laptop, I process the queue. Real fix: migrate the build agent to the laptop's always-on cron (~1–2 hr next session).
- **Outlook calendar WRITE** — can READ events from Wattage M365 but can't yet schedule new ones there. Google calendars work for writes.
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

- **Commits this session:** ~25 (from `89056d1` "fix WhatsApp self-chat bug" through `7c58200` "voice OUT robustness")
- **Constitution rules added:** R17 → R37 (21 new rules)
- **mind.md sub-rows added:** 5 → 5l (12 sub-sessions)
- **Lessons added:** L21 → L35 (15 lessons)
- **Features implemented:** 4 (voice in, /addfeature, non-receipt image ID, voice out + streaming)
- **Daily ntfy pushes confirmed working:** ~10
- **Scheduled cloud agents:** 2 (May 12 refactor + daily build agent currently firewalled)

## My recommendation for tomorrow

1. **Use it for a real day** — morning brief at 7am, ask it stuff via WhatsApp + dashboard, dictate notes via mic, send a receipt photo. Real usage surfaces real gaps.
2. **Then migrate the build agent to the laptop** (1–2 hr) so queued features auto-implement going forward.
3. **Then everything else** — Outlook write, email channel, tool indicators, tests, key rotation. All in the backlog file.

Sleep well.
