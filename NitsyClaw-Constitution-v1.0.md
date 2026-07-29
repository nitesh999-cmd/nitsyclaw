# NitsyClaw-Constitution-v1.0.md

**Status:** Active. Immutable. Rules are never deleted, only superseded by a higher-numbered rule referencing the original.
**Established:** 2026-04-25
**Maintainer:** Nitesh

---

## Rules

### R1 — Naming is provisional until publicly committed
"OpenClaw" collides with an existing open-source project (openclaw.ai, github.com/openclaw/openclaw, also referenced as ClawdBot / Moltbot in some marketplaces). The internal codename "OpenClaw" MAY be used inside this repo. It MAY NOT be used for any public-facing surface (domain, GitHub repo, App Store listing, marketing copy, support email) without an explicit rename decision recorded as a superseding rule.
- *Source:* `mind.md` §1, web search 2026-04-25 — multiple results for openclaw.ai
- *Added:* 2026-04-25

### R2 — Two WhatsApp paths, never mixed in the same deployment
The project supports two WhatsApp transports and a single deployment runs exactly one:
- **Path A (Cloud API)** — Meta WhatsApp Business Cloud API. Required for any multi-user or commercial use. Subject to Meta 2026 rules: outbound templates required outside 24hr window; AI chatbots must perform "concrete business tasks" — no open-ended AI chat.
- **Path B (Personal/unofficial)** — `whatsapp-web.js` or `Baileys`. Allowed only for single-recipient personal use (Nitesh's own number talking to itself). Carries account-ban risk. Not allowed for any user other than Nitesh.

Mixing both paths in one deployment is forbidden. Ideas in `ideas/` are tagged with the path(s) on which they are viable.
- *Source:* WhatsApp Cloud API 2026 docs (Meta), Sanuker/Woztell 2026 update writeups
- *Added:* 2026-04-25

### R3 — Every non-trivial session runs the NWP 7-step loop
Per Nitesh's global `CLAUDE.md` (`NWP-Constitution-v1.0`). The first or second tool call must be a TodoList of the 7 steps. Trivial bypass only for pure pleasantries with zero tool calls.
- *Source:* `~/.claude/CLAUDE.md` — Nitesh global
- *Added:* 2026-04-25

### R4 — Code and docs change in the same commit
If `src/` changes, the corresponding section of `mind.md` (and Constitution if a rule is touched) MUST be updated in the same commit. CI MUST reject commits that fail this check once a CI is in place.
- *Source:* `~/.claude/CLAUDE.md` — Nitesh global "Session discipline"
- *Added:* 2026-04-25

### R5 — Single source of truth is Postgres
WhatsApp surface and Dashboard surface are read/write UIs over the same Postgres schema. No duplicated state. No "WhatsApp memory" separate from "Dashboard memory". Memory, events, config, scheduled tasks, integrations — one DB, one schema.
- *Source:* Pre-mortem failure mode #4 — state divergence
- *Added:* 2026-04-25

### R6 — Privacy by default
- Phone numbers MUST be hashed or masked in any log line that ships outside the host machine.
- WhatsApp message bodies MUST be encrypted at rest (column-level or full-disk).
- LLM provider call logs MUST NOT include full message content beyond a 30-day rolling window — older content is summarized and the raw is purged.
- `.env.local` is the only source of secrets in this repo. `.env.local` is gitignored. `.env.local.example` is the public template.
- *Source:* Pre-mortem failure mode #5 — privacy leak
- *Added:* 2026-04-25

### R7 — Every idea is tagged tier + effort; ship P0 first
Every entry in `ideas/` carries:
- `tier`: P0 (must ship in v1) | P1 (next) | P2 (someday) | P3 (parking lot)
- `effort`: S (≤1 day) | M (≤1 week) | L (>1 week)
- `path`: A | B | both | neither (dashboard-only)

The first build sprint touches **only** P0 items. P0 has a hard ceiling of 10 items. New ideas default to P2 unless explicitly promoted.
- *Source:* Pre-mortem failure mode #3 — idea bloat
- *Added:* 2026-04-25

### R8 — Push automatically after any code change
After any commit, `git push origin main` runs without asking the user. Authentication via `GITHUB_PAT` in `.env.local`. Per Nitesh global rules.
- *Source:* `~/.claude/CLAUDE.md` — Nitesh global "Session discipline"
- *Added:* 2026-04-25

### R9 — Every claim in docs cites at least one source
Web research, ToS claims, API behavior claims — each gets a `Source:` line with URL or doc reference. NWP Step 3 minimum is 3 independent sources per material claim.
- *Source:* `NWP-Constitution-v1.0.md` Step 3
- *Added:* 2026-04-25

### R10 — Skills system mirrors upstream OpenClaw
Where it costs nothing, mirror the existing OpenClaw skill format (`skills/<name>/SKILL.md` with metadata + tool instructions). This preserves a future option to interoperate with or fork from upstream. Internal Cowork skills (`nitesh-skills/*`) remain separate; project skills live under `OpenClaw/skills/` if/when added.
- *Source:* DigitalOcean OpenClaw writeup, github.com/openclaw/openclaw README
- *Added:* 2026-04-25

### R11 — Adversarial review before any P0 idea promotion
Before a P1 idea is promoted to P0, run an adversarial pre-mortem (≥3 failure modes, each with mitigation) and append it to the idea's entry. No silent promotion.
- *Source:* NWP Step 6
- *Added:* 2026-04-25

### R12 — Constitution is append-only
Rules are never edited or deleted. To change a rule, add a new rule (R13+) that explicitly says *"Supersedes R<n>"* and explains why. The original rule stays in place with a "Superseded by R<m> on YYYY-MM-DD" line appended.
- *Source:* Nitesh global pattern
- *Added:* 2026-04-25

### R1 — Superseded by R13 on 2026-04-25.

### R13 — Project name is "NitsyClaw" (Supersedes R1)
On 2026-04-25 Nitesh chose **NitsyClaw** as the project name, replacing the placeholder "OpenClaw". All public-facing surfaces use NitsyClaw. The repo, package names, dashboard title, and codenames are renamed accordingly. R1's collision concern is resolved.
- *Source:* User decision 2026-04-25
- *Added:* 2026-04-25
- *Supersedes:* R1

### R14 — Split deployment is mandatory (Vercel + Railway)
Dashboard runs on Vercel (serverless, optimal for Next.js). Bot worker runs on Railway (long-running process required for whatsapp-web.js + Puppeteer). Both share a single Supabase Postgres database. Vercel serverless cannot host whatsapp-web.js — proven failure mode. Both deployments read env from a synchronized source of truth.
- *Source:* whatsapp-web.js Railway/Puppeteer issue threads (github.com/pedroslopez/whatsapp-web.js/issues/2057), 2026-04-25 research
- *Added:* 2026-04-25

### R15 — Test pyramid is non-negotiable
Every P0 feature must have:
1. **Unit tests** — pure logic in `packages/shared/src/features/*.ts` covered ≥80%.
2. **Integration tests** — feature flow exercised through agent loop with `MockWhatsAppClient` + in-memory DB; ≥1 happy path + ≥1 error path per feature.
3. **E2E tests** — Playwright against the dashboard for any feature with a UI surface.

CI fails on coverage <70% lines / <65% branches. Live WhatsApp tests are tagged `@live` and skipped in CI.
- *Source:* User direction "test them to death", 2026-04-25
- *Added:* 2026-04-25

### R16 — `WhatsAppClient` is an interface, never a concrete dependency
Feature code never imports whatsapp-web.js directly. Features depend on the `WhatsAppClient` interface in `packages/shared/src/whatsapp/client.ts`. Two impls: `WwebjsClient` (real, in `apps/bot`) and `MockWhatsAppClient` (test only). This makes Path A (Cloud API) migration a one-file swap. Violations fail review.
- *Source:* Pre-mortem #3 — test flakiness; R2 path-swap requirement
- *Added:* 2026-04-25

### R17 — System prompt is a single source of truth across surfaces
All NitsyClaw surfaces (WhatsApp, dashboard chat, future Telegram, etc.) build their system prompt via `packages/shared/src/agent/system-prompt.ts` `buildSystemPrompt({surface})`. Surface-specific tone/length differences are encoded in the helper, not in scattered string literals. Violations create the "different versions" deflection bug fixed in session 5.
- *Source:* Session 5 — dashboard /chat used to deflect to WhatsApp because its inline prompt didn't match
- *Added:* 2026-04-28

### R18 — Conversation history is shared across surfaces, single Postgres source
Every surface PERSISTS its own messages to the `messages` table tagged with `surface IN ('whatsapp','dashboard',...)` AND PULLS the last N messages across BOTH surfaces (no surface filter) as agent context before each turn. Same `fromNumber = hashPhone(ownerPhone)` for both surfaces. Reaffirms R5 and extends it: history is also single-source, not just memories/reminders.
- *Source:* Session 5 — same-page implementation
- *Added:* 2026-04-28

### R19 — Web search uses Anthropic server-side `web_search_20250305`
Do not wire external web-search providers (Tavily/Exa/Brave) for tool use. The Anthropic-built-in `web_search_20250305` server tool is appended to the `tools` array passed to `messages.create` in every surface's LLM client. Zero external API key, zero infra. If a future need requires logging/auditing search queries, supersede this rule with a higher-numbered one — don't quietly add a second provider.
- *Source:* Session 5 — research compared Tavily, Exa, Brave; built-in won
- *Added:* 2026-04-28

### R20 — Vercel routes that call Anthropic must declare `runtime = "nodejs"` and `maxDuration`
`/api/chat`, `/api/chat/history`, and any future tool-using API route MUST set `export const runtime = "nodejs"` (Edge runtime can't run our deps), `export const dynamic = "force-dynamic"` (no static caching), and `export const maxDuration = 60` (agent loops can take >10s).
- *Source:* Session 4 — earlier route was timing out at default 10s on tool-use rounds
- *Added:* 2026-04-28

### R21 — ASCII-only in PowerShell scripts
PowerShell silently breaks on em-dashes (—), smart quotes (" "), and ellipsis (…) when invoked via `powershell.exe -File`. All `.ps1` files use ASCII hyphens, straight quotes, three dots only.
- *Source:* Session 4 — repeated silent failures from autocorrected dashes
- *Added:* 2026-04-28

### R22 — Always clear `.git/index.lock` before git ops
Crashed PowerShell scripts leave `.git\index.lock` behind, which blocks all subsequent git operations with "fatal: Unable to create .git/index.lock". Every script that touches git starts with `Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue`.
- *Source:* Session 4
- *Added:* 2026-04-28

### R23 — NEVER `vercel env pull` (destructive to local `.env.local`)
`vercel env pull` overwrites the local `.env.local` with Vercel's stripped-down version, losing local-only secrets (GITHUB_PAT, ENCRYPTION_KEY backups, dev tokens). Local is the source of truth; push TO Vercel via the dashboard UI or CLI `vercel env add`, never pull FROM.
- *Source:* Session 3 — lost ENCRYPTION_KEY once, regenerated everything
- *Added:* 2026-04-28

### R24 — Vercel env values pasted WITHOUT surrounding quotes
Vercel's "Import .env" UI preserves quotes literally — `DATABASE_URL="postgresql://..."` becomes `"postgresql://..."` (with the actual quote chars in the value). Always paste the raw value with no quotes.
- *Source:* Session 3 — DB-not-configured bug; took hours to find the corrupted env var
- *Added:* 2026-04-28

### R25 — When Vercel build fails, redeploy WITHOUT cache to surface real errors
Vercel keeps serving the last successful deploy when a new build fails — the live site looks fine but the new code never landed. To diagnose: in the Vercel UI on the failed deploy, click "Redeploy" and uncheck "Use existing Build Cache". Surfaces the real TS error in the build log, which can then be read via `vercel inspect <deployment-url> --logs`.
- *Source:* Session 4 — chased phantom "deployment ok" before realizing it was stale
- *Added:* 2026-04-28

### R26 — Shared package NEVER imports from `apps/*` (R16 reaffirmed)
`packages/shared/*` must not import (statically OR dynamically) from `apps/bot/*` or `apps/dashboard/*`. Concrete violation: `04-morning-brief.ts:84` and `05-whats-on-my-plate.ts:26` dynamic-import `apps/bot/src/adapters.js`. This poisons the dashboard build (every bot strict-mode bug blocks dashboard deploy). Aggregator functions must be exposed via `AgentDeps` and wired by each app at boot. Cleanup scheduled: `trig_01XYHgVLJMMAVQQbBAFjr7Az` fires 2026-05-12.
- *Source:* Sessions 3+4 — caused 4+ Vercel build failures
- *Added:* 2026-04-28

### R27 — `noUncheckedIndexedAccess` violations: grep the full build path before pushing
When a TS error like "Object is possibly 'undefined'" or "Type 'undefined' cannot be used as an index type" surfaces, before fixing-and-pushing, grep the full transitive build path for sibling violations: `\.split\([^)]+\)\[\d+\]\.`, `\.match\([^)]+\)\?\.\[\d+\]`, `\?\?\s*\w+\.split\([^)]+\)\[\d+\]`. Each unfixed sibling burns one Vercel deploy cycle.
- *Source:* Session 4 — four sequential failed deploys, one error each
- *Added:* 2026-04-28

### R28 — Hidden Windows scheduled tasks use VBS launcher, not `-WindowStyle Hidden`
Scheduled tasks with `Logon Mode: Interactive only` will flash a console window on the user's monitor every trigger, regardless of `-WindowStyle Hidden` on the spawned `powershell.exe`. The reliable hidden pattern: invoke a tiny `.vbs` via `wscript.exe` that uses `WshShell.Run cmd, 0, False` (vbHide). VBS-driven launches are truly invisible. No Windows password storage required (unlike "Run whether logged on or not"). See `broom-silent.vbs` as the reference impl.
- *Source:* Session 5b — every-2-min black-screen flash on Nitesh's main monitor from `NitsyClaw Broom`
- *Added:* 2026-04-28

### R29 — Backend files updated after EVERY fix, not just session-end (extends R4)
R4 says "code and docs change in the same commit." R29 reaffirms cadence: after every fix (not every session), the same push includes mind.md (lessons, session log, debt) AND the Constitution if a rule was touched, AND CLAUDE.md/CLAUDE-CODE-BACKLOG.md/PARKED-TASKS.md if scope or status moved. Never let "I'll batch the doc updates at session end" become a backlog item. Source-of-truth files stay live.
- *Source:* Session 5b — Nitesh asked for this discipline explicitly after I shipped the broom fix without touching mind.md
- *Added:* 2026-04-28
- *Extends:* R4

### R30 — Watchdogs are surgical, never restart-everything
A watchdog (broom, supervisor, healthcheck loop) restarts ONLY the process that's actually dead. It NEVER calls a launcher that kills-and-respawns sibling processes. Concrete violation: pre-2026-04-28 broom called `silent-launcher.ps1` every 2 min when EITHER bot OR dashboard was dead — and silent-launcher does `Get-Process node | Stop-Process -Force` (kills ALL node), so the bot died mid-WhatsApp-handler every cycle. Pattern: per-process idempotent launchers (e.g. `launch-bot.ps1`) that exit early when the target process is alive, called only for the specific dead process.
- *Source:* Session 5c — user's "hello" message never got a reply because handler was killed mid-flight
- *Added:* 2026-04-28

### R31 — Local dashboard is NOT a watchdog responsibility
Vercel hosts the production dashboard at `https://nitsyclaw.vercel.app`. Local `pnpm dashboard` is optional dev convenience. Watchdogs guard production-critical processes only (the WhatsApp bot, since that's the only thing that MUST run on-laptop). Restarting the local dashboard if it dies has zero user impact.
- *Source:* Session 5c — broom was thrashing trying to keep local dashboard alive
- *Added:* 2026-04-28

### R32 — `*add <description>` is the canonical Claude Code feature-request trigger
When Nitesh types `*add <description>` to Claude Code, Claude evaluates: if small (< ~30 min, self-contained), implements immediately + commits + pushes + R29 doc update. If larger, appends to `CLAUDE-CODE-BACKLOG.md` "User-added feature requests" table with timestamp, description, size estimate, status. Single-line confirmation either way. Codified in NWP-CONSTITUTION-v1.2.md triggers and project-root `CLAUDE.md`.
- *Source:* Session 5c — Nitesh asked for "one command to give Claude Code to add a feature"
- *Added:* 2026-04-28

### R33 — Process-killer scripts must self-exclude (watchdog suicide pattern)
Any script that enumerates `Get-Process` / `Get-CimInstance` and kills matches MUST `-notmatch` its own script filename, the launcher that spawned it (e.g. `broom-silent.vbs`), and any sibling launcher in the family. Concrete violation: broom.ps1's regex matched substring `nitsyclaw` (which appears in its own commandline path), killing itself every 2 min for ~17 min straight. Better pattern: narrow the positive match to specific launcher signatures (`pnpm bot|next dev|tsx watch`) instead of catch-all path tokens.
- *Source:* Session 5d — broom suicide loop discovered via broom.log "killing visible PID" entries
- *Added:* 2026-04-28

### R34 — WhatsApp bot health includes wa-session websocket, not just process
The bot can be "alive" in PID terms AND log "[wwebjs] client ready" while the puppeteer-controlled WhatsApp websocket has silently dropped. No `disconnected` event fires; inbound stops arriving. Currently the only fix is operator-triggered restart. TODO (high priority): add a periodic wa-session probe (e.g. every 10 min, list 1 chat via wweb client; if it throws, trigger self-restart) so operator intervention isn't needed.
- *Source:* Session 5d — bot up 17 min but received zero real messages, restart fixed it
- *Added:* 2026-04-28

### R35 — `feature_requests` Postgres table is the canonical pending-features queue (extends R5 + R32)
All net-new feature asks captured from WhatsApp / dashboard via `request_feature` tool land in the `feature_requests` Postgres table (single source of truth per R5). The `*add` Claude Code trigger (R32) ALSO writes to this table when used in-session, in addition to (or instead of) the `CLAUDE-CODE-BACKLOG.md` markdown table. Markdown lives for human-readable snapshots and curated long-running priorities (P0–P7); the live queue is in DB. PARKED-TASKS.md is deprecated as of 2026-04-28 — its open items moved to BACKLOG.
- *Source:* Session 5e — Nitesh asked for end-to-end "request anywhere → implemented automatically"
- *Added:* 2026-04-28
- *Extends:* R5, R32

### R37 — Push notification on every bot reply (ntfy.sh primary)
WhatsApp's self-chat notifications are unreliable (often silent, especially after agent-loop delays). To guarantee Nitesh sees replies on whichever device he's on: every outbound from the bot (sendAndPersist, reply_to_user, transcribe/receipt confirmations) ALSO calls `pushNotify(text)` from `@nitsyclaw/shared/notify` which POSTs to a ntfy.sh topic. Topic in `NTFY_TOPIC` env var (default in repo's `.env.local`: `nitsyclaw-b3011652d4279674`). Optional Windows-toast fallback via `WINDOWS_TOAST=true`. Both are best-effort and never block the actual WhatsApp send. ntfy.sh chosen over Pushover/Pushbullet for: free no-signup, no API key, persistent inbox, cross-device, self-hostable later if needed.
- *Source:* Session 5f — Nitesh missed bot replies because WhatsApp notifications didn't fire / he'd switched apps before the agent finished
- *Added:* 2026-04-28

### R41 — Material info and opinion asks trigger Council + Agents + Best Skill (never solo)
When Nitesh brings **material information** (real decision, tradeoff, strategy shift, pivot, new data with stakes) OR asks for **thoughts / opinion / "what do you think"**, the response MUST run all three:
1. **LLM Council** — 5-advisor pass: independent analyses → anonymous peer review → synthesised verdict. Use the `llm-council` skill where present.
2. **Agents** — relevant independent agents spawned in parallel (review/research/security per the task) for second opinions. No grinding solo when the council pattern applies.
3. **Best available skill across the AI universe** — route to the strongest matching installed skill (`nitesh-skill-stack`) AND actively hunt external via `ai-skills-radar` / `marketplace-audit` for a better skill/MCP/tool before acting. Respect each project's install-safety rules.

For routine, mechanical, asked-and-told tasks (bug fix with one obvious fix, doc cadence updates, restart-a-process, paste-a-file), proceed normally without the council overhead — these are not material decisions. For opinion asks the council ALWAYS fires regardless of perceived stakes.

Skipping the council on a qualifying trigger is a rule violation. If in doubt, ask "material call — run council?" once and proceed per the answer.

- *Source:* Session 2026-06-23 — explicit user instruction after observing repeated solo takes. Codified at three layers (auto-memory feedback file, this rule, global CLAUDE.md Deep-Work Rule) so it cannot quietly drift.
- *Added:* 2026-06-23

### R40 — Every audio feature must have a user-gesture entry-point (browser autoplay policy)
Browser audio APIs (`speechSynthesis`, `<audio>`, Web Audio) require a recent user gesture to actually play. Chrome (desktop + Android) and iOS Safari "expire" the gesture lock during async waits — a primer fired at click-time (R-NA, but per session 5l pattern) does NOT guarantee subsequent async `speak()` calls succeed. They can be silently dropped. Therefore: any feature that wants automatic audio (e.g. streaming TTS reading replies aloud) MUST also expose a manual user-gesture entry-point that re-fires the audio with guaranteed success. Concrete impl: `/chat` shows a 🔊 button next to every assistant message bubble; click → `speechSynthesis.cancel(); speak(content)`. The streaming auto-speak path stays in place for users where it works (no regression); the button is the always-works fallback. The principle generalises: never ship an "automatic audio" feature without a "manually trigger audio" companion.
- *Source:* Session 5o — voice picker preview (sync click→speak) worked; streaming auto-TTS (async after fetch) silently failed on the same browser
- *Added:* 2026-04-29

### R41 — Dashboard private data is authenticated by default
The Vercel dashboard exposes private memories, reminders, conversations, expenses, integration state, and agent APIs. Every dashboard page and dashboard API route MUST be protected before route handlers or server components read private data. Production fails closed when `NITSYCLAW_DASHBOARD_PASSWORD` is missing. Local development may run without the password for velocity, but production must not silently expose data. Static Next assets (`/_next/static`, `/_next/image`, favicon, robots, sitemap) may bypass the gate.
- *Source:* 2026-05-01 public-route privacy audit; Next.js middleware docs (middleware runs before routes render and can respond directly for auth failures)
- *Added:* 2026-05-01

### R42 — WhatsApp owner identity comparisons are normalized
Every WhatsApp owner/self-chat check MUST normalize both `.env.local` phone numbers and WhatsApp message IDs to digits before comparing. `whatsapp-web.js` may emit IDs such as `614...@c.us`, while env values may be stored as `+614...`; raw string comparison can silently drop valid owner messages. Owner-authored self-chat events may also arrive as `fromMe=true` with a non-phone sender ID and `to` equal to the owner number; that shape is allowed only when `to` normalizes to the owner. Normalization must happen in one shared helper and be covered by tests.
- *Source:* 2026-05-01 WhatsApp incident — bot was ready but dropped owner self-chat messages because WhatsApp IDs did not match `.env.local` phone formatting
- *Added:* 2026-05-01

### R43 — WhatsApp replies must be mobile-first and confirmations must be real
WhatsApp replies MUST be readable on a phone: no markdown tables, no corrupted emoji bytes, and no layout that relies on wide desktop bubbles. Use short bullets or compact plain text. The bot MUST NOT consume `yes`/`no` with the confirmation rail unless a real pending confirmation exists. If there is no pending confirmation, the message continues through the normal agent flow with conversation context.
- *Source:* 2026-05-01 WhatsApp screenshots — table-style output was awkward on mobile; `Yes` after a normal assistant question returned `No pending confirmations`; morning brief showed mojibake characters
- *Added:* 2026-05-01

### R44 — Local WhatsApp watchdog treats stale logs as unhealthy
For the local Path B bot, an alive `node.exe` process is not sufficient health. The bot must write a dedicated WhatsApp health heartbeat from successful active probes, and broom must use that heartbeat rather than `bot.log` freshness. If the heartbeat is stale or missing past the grace window, broom may restart only the matched bot process tree with cooldown/backoff. The restart must remain surgical: stop only NitsyClaw bot processes and NitsyClaw-owned WhatsApp profile processes, never all Node processes and never the dashboard. Recurring watchdogs must not kill "visible" PowerShell/Node children as cleanup; Windows child command lines do not reliably preserve hidden-window intent, and this can kill healthy bot processes. Always-on launchers must run the bot's production `start` command, not dev/watch mode; dev/watch must be migrated instead of counted as healthy production.
- *Source:* 2026-05-01 repeated WhatsApp incidents — bot process remained alive while WhatsApp intake stopped and `bot.log` stopped updating
- *Added:* 2026-05-01

### R45 — WhatsApp client wrapper owns liveness recovery
The concrete `whatsapp-web.js` adapter must not assume that the first `ready` event means the client will stay healthy. The adapter must actively probe WhatsApp state after ready, treat repeated non-healthy probe results as a recoverable client failure, and recreate the underlying client while preserving registered message handlers. The health probe must remain ref-held in production `start` mode so Node cannot exit immediately after ready. `disconnected`, `auth_failure`, and outbound send failures must be visible in logs and must trigger recovery rather than leaving a dead client inside a live Node process. External watchdogs remain a second layer only; the first recovery layer belongs inside the WhatsApp adapter.
- *Source:* 2026-05-01 repeated WhatsApp incidents and agent review — client stayed alive or ready while messages stopped flowing
- *Added:* 2026-05-01

### R46 — Dashboard mutations require same-origin proof
Every dashboard route that mutates state or triggers agent work MUST reject requests unless `Origin` or `Referer` matches the route's own origin. Basic Auth alone is not enough because browsers can reuse cached credentials on cross-site form posts. This applies at minimum to `/api/chat`, `/api/chat/stream`, `/api/data/delete`, and `/api/queue/update`; new POST/PUT/PATCH/DELETE dashboard routes must use the shared `requireSameOrigin` guard before parsing form data, JSON, or touching the database. The guard must be covered by unit tests and at least one e2e hostile-origin POST check for destructive endpoints.
- *Source:* 2026-05-04 launch-readiness audit — mutating dashboard POST routes had auth but no CSRF/same-origin defense
- *Added:* 2026-05-04

### R47 — Production dashboard auth uses signed sessions, not browser-cached Basic Auth
The production dashboard middleware must stay edge-safe and must not import the database client. It should allow only configured auth paths and requests with a valid signed HTTP-only session cookie. Credential checking and lockout accounting belong in a Node runtime route where Postgres is available. Failed login attempts must be stored durably by client key so lockouts survive serverless instance churn. Session tokens must be HMAC-signed with the dashboard password, expire automatically, and become invalid when the dashboard password rotates.
- *Source:* 2026-05-04 build after launch audit — Basic Auth lockout was in-memory only and browser-cached credentials increased cross-site risk
- *Added:* 2026-05-04

### R48 — Auth surfaces must be explicitly reversible, framed, and migrated
Dashboard authentication changes must include an explicit sign-out path, strict same-origin protection on login/logout POST routes, security headers from middleware, and a committed SQL migration for any auth state tables. Runtime `CREATE TABLE IF NOT EXISTS` may remain as a safety net, but it cannot be the only record of schema. Login screens must not expose the authenticated dashboard navigation shell.
- *Source:* 2026-05-04 top-five hardening build — session auth needed logout, migration, security headers, and clean login shell follow-through
- *Added:* 2026-05-04

### R49 — Production code must not carry lint debt
Runtime files under `apps/*/src` and `packages/*/src` must stay free of lint warnings. Test helper warnings are tracked separately, but production adapters, feature modules, integrations, routes, and middleware should use named types or narrow local interfaces instead of `any`, unused imports, or unused catch variables.
- *Source:* 2026-05-04 top-five cleanup — removed production-code lint warnings from Microsoft Graph, WhatsApp client, feature registry, receipt expense, email search, and Spotify integration
- *Added:* 2026-05-04

### R50 — Test code must not carry lint debt
Test files and test helpers must stay lint-clean too. Explicit `any` in tests requires a named local type, a narrow interface, or a consciously exported fake/test type. Reasoning: warnings in tests train operators to ignore lint output, which hides future production regressions.
- *Source:* 2026-05-04 test-lint cleanup — removed remaining test-only explicit `any` warnings and typed the fake DB helper
- *Added:* 2026-05-04

### R51 — Owner exports and private API responses are privacy-safe by default
Owner data exports may include sensitive tables, but export routes MUST redact credentials, tokens, raw tool inputs/outputs, private message bodies, emails, phone numbers, and sensitive audit errors at response time, including historical rows created before sanitizer improvements. Private dashboard API responses, OAuth/status endpoints, middleware auth gates, and protected-page responses MUST set `Cache-Control: no-store`, and unexpected server errors returned to the browser MUST use user-safe generic wording unless a specific public configuration error is intended.
- *Source:* 2026-05-04 top-20 hardening batch — `/api/data/export` could still return historical raw audit payloads; private GET routes lacked consistent no-store headers
- *Added:* 2026-05-04

### R52 — Public errors are safe, raw errors are logs only
Dashboard, bot, OAuth, export/delete, and health surfaces must not return raw provider/API/DB exception messages to users. Known configuration failures may use explicit public messages such as "Dashboard database is not configured." Ordinary runtime failures must return short generic wording and log the raw error server-side with a route/component label. Release packaging must explicitly exclude local env files, OAuth credential/token JSON, and WhatsApp session state from Vercel and Docker contexts.
- *Source:* 2026-05-05 gold hardening pass — dashboard/bot routes returned raw-ish errors and `.vercelignore` missed `google-credentials.json`
- *Added:* 2026-05-05

### R53 — Operator surfaces render fast even when state is slow
Command/control surfaces such as `/command` must render the primary action path quickly even if secondary DB state, heartbeats, audit summaries, or queue counts are slow. Operational state may degrade to "unavailable"; the command runner must still load. Reasoning: an operator page that blocks on status telemetry is not an operator page.
- *Source:* 2026-05-05 operator command surface — initial `/command` page loaded but blocked for ~24.8s on local state reads, breaking Playwright and operator trust
- *Added:* 2026-05-05

### R39 — Streaming clients must degrade visibly, never silently (extends R20)
Any client that consumes a streaming endpoint MUST guarantee the user sees SOMETHING for every Send action. Concretely for `/chat` consuming `/api/chat/stream`: (a) check `response.ok` and `response.body` before reading; treat 4xx/5xx as a clean Error bubble; (b) log every parsed NDJSON event to console (`console.log("[chat] event: ...")`) so DevTools makes the failure mode observable without server-log access; (c) update the assistant message via reverse-search for the last assistant role rather than `arr[arr.length-1]` (state-ordering races put the user message there sometimes); (d) if the stream completes with zero text deltas AND no `error` event was displayed, AUTOMATICALLY fall back to the non-streaming `/api/chat` endpoint and show its `reply` field — both endpoints run the same agent loop, the streaming one is purely an optimisation. Reasoning: silent failure is worse than visible failure. A user who sees "Error: HTTP 500" or "(empty reply)" can debug; a user who sees their own bubble and nothing else assumes the whole product is broken.
- *Source:* Session 5n — user reported "no reply" across two Chrome browsers; server-side endpoints all confirmed healthy via curl, but bug couldn't be reproduced without DevTools. Defensive client guards landed before root cause was found.
- *Added:* 2026-04-29
- *Extends:* R20 (Vercel route discipline) — adds the matching client-side discipline

### R38 — Calendar provider is selected per-request, persisted into the confirmation payload (extends R5 + R16)
The `schedule_call` tool accepts `calendar: "google" | "outlook"` (default `"google"`). The chosen provider is stored in the confirmation payload, NOT in the deps or environment. `resolve_confirmation` reads `payload.calendar` and routes through `ctx.deps.calendar.createOutlookEvent` when outlook is requested AND the optional method exists on the surface's `CalendarClient`; otherwise it falls back to `createEvent` (Google) and surfaces `fallback: "outlook unavailable on this surface; created on Google instead"` so the agent can tell the user. Reasoning: the dashboard surface (Vercel route) cannot reach the laptop's `ms-token.json`, so it MUST be allowed to silently degrade rather than hard-fail. The optional method on `CalendarClient` (rather than a separate `OutlookClient` dep) keeps the interface back-compat with all existing fakes/noop impls — adding a new provider becomes a one-method addition, not a breaking change.
Concrete bot wiring: `apps/bot/src/adapters.ts` provides `realCalendar.createOutlookEvent` which delegates to `createMsEvent` in `apps/bot/src/microsoft-graph.ts` (POST `/me/events` via Microsoft Graph, attendees mapped to `emailAddress.address`, timezone defaults to `process.env.TIMEZONE ?? "Australia/Melbourne"`). `microsoft-graph.ts` is imported only by `apps/bot/*` — `packages/shared/*` never imports it (R26 clean).
- *Source:* Session 5m — backlog Priority 3.1; Wattage M365 was auth'd in session 2 with `Calendars.ReadWrite` but write path was never wired
- *Added:* 2026-04-29
- *Extends:* R5 (single Postgres source — confirmation payload is the SoT for the chosen provider), R16 (CalendarClient stays an interface; concrete provider chosen at deps-build time)

### R36 — Daily build agent contract: NWP-bound, surgical, safety-gated
A scheduled CCR routine ("NitsyClaw build agent") fires daily and processes every `feature_requests` row where `status='pending'`. For each row: marks `in_progress`, runs the full 7-step NWP loop (skipping step 2 since no user is online), implements via Edit/Write, runs tsc, commits with `feat(<surface>): ...`, pushes to `origin/main`, polls Vercel deploy if dashboard files changed, inserts a notification row in `messages` (matching surface, direction='out') so user sees the result on next chat open, then marks `done` with `implementation_notes` and `pr_url`. SAFETY: any request that touches secrets / drops tables / requires paid external service / disables tests must be marked `rejected` with a clear `rejection_reason` rather than implemented. The agent never runs destructive operations beyond what NitsyClaw itself does. Schedule managed via claude.ai/code/routines.
- *Source:* Session 5e — auto-implementation contract for the daily build agent
- *Added:* 2026-04-28

### R54 — Operator missions must queue through the durable feature ledger
Aggressive build-program actions from `/command` MUST write to `feature_requests` with stable `dedupe_key` values instead of spawning invisible work. Repeated mission launches must be idempotent, and the dashboard must show how many of the top operator missions are already in the queue. This keeps overnight "go all in" requests auditable and recoverable without adding a production migration unless the existing ledger is no longer enough.
- *Source:* Session 38 — `/api/operator/jobs` and top-20 operator mission catalog
- *Added:* 2026-05-05

### R55 — Mutating dashboard routes must be auto-discovered by red-team tests
Every dashboard API route that exports `POST` MUST be protected with `requireSameOrigin`. The regression suite must discover POST route files automatically rather than relying only on a hand-maintained list, so new mutating routes fail tests if they omit the guard.
- *Source:* Session 39 — `dashboard-redteam-routes.test.ts`
- *Added:* 2026-05-05

### R56 — Build execution belongs to the laptop runner, not Vercel
Dashboard/Vercel may queue, display, and audit operator work, but it MUST NOT run shell commands, mutate git, or perform local filesystem builds. The build runner runs from the laptop with explicit modes: dry-run preview by default, `--claim` to mark work in progress, and `--reject-unsafe` to reject dangerous requests. The runner must reject requests that disable tests, leak secrets, remove auth, commit env files, or perform destructive database-style actions.
- *Source:* Session 40 — `scripts/operator-runner.ts` and `packages/shared/src/ops/operator-runner.ts`
- *Added:* 2026-05-05

### R57 — Local self-healing must leave remote evidence
Any local watchdog or self-healing process that restarts the WhatsApp bot MUST publish a durable `system_heartbeats` signal that the hosted dashboard can read. Local log files are useful for forensics, but they are not sufficient for product health because Vercel cannot inspect the laptop filesystem.
- *Source:* Session 41 — `scripts/watchdog-heartbeat.ts`, `broom.ps1`, and `/health`
- *Added:* 2026-05-05

### R58 — Production deploys need a tested rollback target
Every production deploy must have a concrete rollback target and a dry-run-first command that can restore the public production aliases. If the release includes database migrations, the rollback note must state the exact migration/backup restore path. If it does not include migrations, the rollback note must explicitly state that no database schema rollback is required.
- *Source:* Session 42 — `scripts/vercel-rollback.ps1` and `docs/rollback/production-rollback.md`
- *Added:* 2026-05-05

### R59 — Private history must not be sent to external web search by default
Dashboard or bot chat routes that load private cross-surface history MUST NOT attach provider-side web-search tools by default. Web/current-info research must be an explicit tool path with minimal query text, clear user intent, and no full private conversation history unless a future reviewed design says otherwise.
- *Source:* Session 43 — post-deploy security review of `/api/chat` and `/api/chat/stream`
- *Added:* 2026-05-05

### R60 — Destructive data controls need transaction, audit, and fresh backup guard
Any owner-facing destructive data deletion MUST run inside one database transaction, write a sanitized audit row, and require stronger confirmation for full-account deletion. Full deletion requires fresh password re-auth plus a signed, session-bound, non-truncated export proof. The proof must not be a plain timestamp that can be forged.
- *Source:* Session 43 — `apps/dashboard/src/app/api/data/delete/route.ts`
- *Added:* 2026-05-05

### R61 — Global auth abuse signals must not lock out correct owner credentials
Global login-failure counters may be used for alerting, suspicious traffic signals, or soft throttling of bad attempts. They MUST NOT reject a correct owner login before checking credentials. Per-client lockout may remain a hard gate.
- *Source:* Session 43 — post-deploy review of dashboard login lockout
- *Added:* 2026-05-05

### R62 — Every private-data dashboard API route must call requireDashboardSession directly (extends R41)
Documenting an auth invariant in the Constitution (R41) is not the same as enforcing it in code. A full-codebase bug hunt found that `verifyDashboardSessionToken` was implemented and used only by the login/logout routes — no data-bearing API route ever called it. Fourteen routes (`search`, `stats`, `chat`, `chat/history`, `chat/stream`, `data/export`, `data/delete`, `memory/review`, `expenses/export`, `operator/jobs`, `queue/update`, `integrations/health`, `integrations/spotify/status`, `integrations/spotify/connect`) relied solely on `requireSameOrigin`, which is a CSRF check (does the Origin/Referer header match?) and says nothing about whether the caller is logged in — an anonymous visitor on the public `/login` page could `fetch()` any of them from the browser console. Every dashboard API route that reads or mutates private data MUST call `requireDashboardSession(request)` from `apps/dashboard/src/lib/require-dashboard-session.ts` directly inside its own handler (not rely on middleware alone) and short-circuit on its non-null `Response`. `integrations/spotify/callback` is exempt (transitively protected by gating `/connect`, and the callback itself must accept the unauthenticated OAuth redirect). Any new dashboard API route touching private data must add this call before it ships; R55's route-discovery red-team test should be extended to check for it the same way it already checks for `requireSameOrigin`.
- *Source:* Full-codebase bug hunt, session 2026-07-05 — user asked to "find real bugs ... and anything that falls over in front of a user"; grep-traced every call site of `verifyDashboardSessionToken` and found zero data routes called it
- *Added:* 2026-07-05
- *Extends:* R41 (states the invariant), R46 (same-origin is a separate, complementary check — CSRF ≠ authentication)

### R63 — Microsoft Graph calendar/mail timestamps require explicit wall-clock encoding, never string-surgery on ISO
Microsoft Graph's `dateTimeTimeZone` type (used by calendar event `start`/`end`) returns and expects a wall-clock string with NO "Z" suffix and NO UTC offset — it defaults to UTC unless the caller sends a `Prefer: outlook.timezone` header (this codebase does not). `new Date(str)` on a no-timezone ISO string is parsed by the JS engine as **server-local time** per ECMA-262, not UTC and not the declared Graph timezone. `apps/bot/src/microsoft-graph.ts` previously wrote events with `args.start.toISOString().replace("Z", "")` (silently reinterprets a UTC instant as if it were wall-clock-in-`tz`, corrupting the time by the zone offset) and read events with bare `new Date(e.start?.dateTime)` (silently reinterprets Graph's UTC-default wall-clock string as server-local time). Both directions must instead go through `formatZonedNaiveIso(date, timezone)` (write path, in `packages/shared/src/utils/time.ts`, built on `date-fns-tz`'s `toZonedTime`) and `parseGraphUtcDateTime(dateTime, fallback)` (read path, in `microsoft-graph.ts`) respectively. Any future Graph datetime field must be checked against Graph's own type (`dateTimeTimeZone` vs `dateTimeOffset`) before assuming `new Date()` is safe — `dateTimeOffset` fields (e.g. mail `receivedDateTime`) always include a real offset/Z and are safe to parse directly.
- *Source:* Full-codebase bug hunt, session 2026-07-05 — confirmed against `date-fns-tz` v3 source and Microsoft Graph datetime-type docs before fixing
- *Added:* 2026-07-05
- *Extends:* R38 (calendar provider wiring)

### R64 — Notify-channel failures must be counted and surfaced, never silently swallowed forever (extends R37)
R37 makes `pushNotify`/`notifyAll` best-effort so a broken push channel never blocks a WhatsApp reply — but "best-effort" had drifted into "invisible": every channel failure (ntfy non-2xx, Windows toast spawn error, MS mail send error) was caught and `console.error`'d with no counter, health flag, or alert, so a fully-dead notify pipeline (e.g. an `NTFY_TOPIC` typo) could run silently for weeks. `pushNotify`/`sendMsEmailNotify` now return a per-channel `"sent" | "failed" | "skipped"` result; `notifyAll` tracks an in-memory consecutive-all-channel-failure counter and writes it to the `notify-channels` system heartbeat (`upsertSystemHeartbeat`) on every call when a `DB` is passed. The nightly WhatsApp health report reads that heartbeat and surfaces it as an FYI line — it deliberately does not flip the report's own `ready`/`needs_attention` status, since the report itself already arrives over WhatsApp (the most reliable channel) regardless of whether the side-channel notify pipeline is dead.
- *Source:* Full-codebase bug hunt, session 2026-07-05
- *Added:* 2026-07-05
- *Extends:* R37 (push notification on every reply)

### R65 — An @lid self-chat is accepted only after the LID resolves to WHATSAPP_OWNER_NUMBER (extends R42)
WhatsApp now delivers genuine "Message Yourself" events with `to=<id>@lid`, an empty `getChat()` id, and `chatIsMe=false`, so the R42 envelope rules dropped real owner commands (`[wwebjs] dropped: not self-chat ... to=lid chat=empty chatIsMe=false`). Broadly accepting `fromMe=true` or any `@lid` recipient is forbidden — the owner also messages other people, and some of those chats are LID-addressed. When, and only when, the plain envelope rules already said "no" and the envelope is an owner-authored candidate (`fromMe=true`, no group/status/newsletter/broadcast address, no known non-LID chat id, and a plain sender id that is the owner), the client resolves each `@lid` endpoint via whatsapp-web.js `getContactLidAndPhone` (installed 1.34.7) through a bounded TTL cache (10 min, 64 entries, timeout 8 s) and accepts only when every resolved phone normalizes exactly to `WHATSAPP_OWNER_NUMBER`. Every other outcome fails closed: lookup error, empty/malformed payload, echoed mismatched lid, or a phone belonging to somebody else. Repeated *unresolved* candidates (not mismatches, which are correct rejections) raise the `whatsapp-inbound` heartbeat to `degraded`, and the nightly WhatsApp health report may not report `ready` while that is true. Inbound drop logging carries address kinds and counters only — never bodies, numbers, lids, or message ids.
- *Source:* Live regression on `feat/local-brain-browser-proof`, session 2026-07-28; `apps/bot/src/whatsapp-lid-identity.ts`, `apps/bot/src/whatsapp-inbound-gate.ts`, `apps/bot/src/whatsapp-inbound-health.ts`
- *Added:* 2026-07-28
- *Extends:* R42 (owner self-chat acceptance), R64 (health signals must be counted and surfaced)

### R66 — A missing external message id must never become a dedupe key (extends R65)
WhatsApp @lid self-chat events can arrive with no serialized message id. The router built its command-job dedupe key as `whatsapp:${msg.id}` unconditionally, so every id-less message produced the same key, `whatsapp:`. The first such message (2026-07-16) stored a `needs_clarification` job under that key; from then on every id-less message matched it, hit the gate-replay branch, and replied with that one stored receipt — before persisting the inbound turn, before intent analysis, before the agent. A clear request was therefore misreported as ambiguous, with no error and no new job row. Dedupe keys and `sourceExternalId` are now written only when a real message id exists; without one the turn is routed normally. Duplicate protection is preserved through an in-memory replay key derived from a truncated SHA-256 of second-resolution timestamp, media type, and body — never stored, logged, or used as a database key.
- *Source:* Live regression 2026-07-28 20:04; `apps/bot/src/router.ts` (`whatsAppExternalId`, `inboundReplayKey`)
- *Added:* 2026-07-28
- *Extends:* R65 (@lid self-chat acceptance)

### R67 — Live web research runs in the asked-for turn, through a minimal-query server search, or says it cannot (extends R59)
An explicit ask for current information — news, headlines, weather, prices, rates, scores, recent events, or "search the web" — is itself the instruction to search. NitsyClaw must search in that same turn and must never reply with a training-cutoff disclaimer or "would you like me to search?". Live search is Anthropic's `web_search_20250305` server tool reached through the existing `ANTHROPIC_API_KEY`, issued as its own bounded request carrying only the search query (never cross-surface history, per R59) with an explicit `max_uses` cap so search charges stay predictable. That cap is **per owner turn, not per provider invocation**: every path that can reach the provider in one turn — the router pre-search and the `web_research` client tool inside the agent loop — must draw from one shared budget, and a call with no budget left is refused locally without issuing a provider request. The server tool must not be appended to `LlmClient.toolStep`: that loop re-serialises turns as plain strings and cannot carry the `encrypted_content` the API requires, so search context would be silently lost. Search results are untrusted third-party text and are fenced as reference data before reaching the model. Only model prose plus source title/URL pairs may leave the search layer — `encrypted_content`, `encrypted_index`, `tool_use_id`, request ids, and raw payloads must never reach logs, storage, or WhatsApp. When search is disabled, unsupported, rate limited, or failing, the bot returns exactly one honest unavailable message and answers nothing from stale model knowledge; no surface may print a placeholder search result that reads like real data. Web research state is reported as a non-secret health signal, and the nightly report may not claim `ready` while it is unavailable.
- *Source:* Live defect 2026-07-28 ("today's world news" answered with a 2024 cutoff disclaimer and a confirmation question); `packages/shared/src/search/live-web-research.ts`, `packages/shared/src/search/anthropic-web-research.ts`, `apps/bot/src/router.ts`, `apps/bot/src/nightly-health-report.ts`
- *Added:* 2026-07-28
- *Extends:* R59 (private history must not be sent to external web search), R64 (health signals must be counted and surfaced)

### R68 — A live-information turn is answered by the cloud model or not at all (extends R67)
The local brain has no web access, so routing a live-information turn to it guarantees a stale or invented answer. When a turn requires live web results — an explicit current-news/weather/price/recent-event/search request, or a turn carrying injected pre-search findings — `auto` mode must select the cloud model, and must block with the honest unavailable message when cloud is unavailable. It must never fall back to the local model for a live answer. This rule sits **below** the sensitivity guard: private and highly sensitive data still stays local, and `local_only` mode remains the owner's explicit choice. Pre-search "success" requires usable findings — ok status, non-empty prose, and at least one source; a zero-source result returns the honest unavailable message immediately, and no command result may claim success with `sourceCount: 0`. Every pre-search attempt writes one privacy-safe audit event (status, available, searchesUsed, sourceCount, answerLen, sanitized failureCode, elapsed time, remaining budget) and the `web_research` tool persists its sanitized failureCode, so a failed turn is diagnosable without a live repro. Only the known internal failure categories may be stored; anything else collapses to `request_failed`. Within one turn, a repeat ask for an already-satisfied research need is served from the turn cache at zero searches and zero provider requests.
- *Source:* Live proof failure 2026-07-28 23:08, proved by read-only DB correlation (`route=local` on every model_route row; `web_research` unavailable with `searchesUsed=2`, `sourceCount=0`; 207-char model-composed reply matching no template); `packages/shared/src/local-brain/router.ts`, `packages/shared/src/search/turn-budget.ts`, `apps/bot/src/router.ts`
- *Added:* 2026-07-28
- *Extends:* R67 (live web research contract), R59 (minimal-query research)

### R69 — A database failure must name its SQLSTATE, and every pooled client must be owned and closed (extends R52)
A driver failure is only diagnosable if its state code survives logging. Error formatting must walk the `cause` chain (bounded depth, cycle-guarded) to find a Postgres SQLSTATE, validate it against the real SQLSTATE **class** set — never a bare five-character shape, which matches Node codes like `EPIPE` — and place it **before** any redacted or truncated message so it cannot be lost. Adding that visibility must cost nothing in privacy: SQL text, bound parameters, and connection strings are stripped before redaction, and logs still carry no host, role, database name, request id, message body, phone number, LID, token, or credential. Database clients are cached by their exact connection string, used for lookup only and never logged or returned, so repeated calls share one pool and different URLs can never be crossed. Shutdown closes every cached client exactly once through an idempotent `closeDb()` that clears its registry before awaiting, wired into the graceful SIGINT/SIGTERM path including its failure branch. Forced termination (`Stop-Process -Force` / SIGKILL) cannot run cleanup — that limit must be stated, not papered over. Write retries, degraded inbound processing, and connection-mode changes are explicitly out of scope: `command_jobs` backs dedupe, replay protection, and exactly-once reply, so continuing past a failed inbound persist trades an honest error for silent duplicate execution.
- *Source:* Proof failures 2026-07-28 (25006 invisible in logs; `getDb(url)` bypassing its own cache); `apps/bot/src/safe-log.ts`, `packages/shared/src/db/client.ts`, `apps/bot/src/index.ts`
- *Added:* 2026-07-29
- *Extends:* R52 (public errors are safe, raw errors are logs only)

### R70 — A cited source is an atomic title/URL pair, and "today" is the owner's local day (extends R67)
Every source that reaches the owner must be rendered as an atomic pair through parsing, caching, prompt injection, and final formatting, using one shared renderer. Pairs occupy two lines — numbered title, then its own URL — because a single-line "Title: url" shape is ambiguous once titles carry their own punctuation, which is how the live proof came to display source labels belonging to different linked domains. Titles are flattened (no newlines or tabs) and fall back to their own hostname when absent. Model-written links are never displayed: the answering model is told not to write URLs or its own source list, any URL it writes is stripped, and the verified pairs are appended verbatim, so every displayed link originates from a parsed search result beside its own title. Separately, "today", "tonight" and "current" always mean the owner's configured local calendar day, resolved through `Intl` with the configured timezone so daylight saving is followed rather than a fixed offset. The local date is passed to the search call, the injected findings block, and the `web_research` tool. A turn shortly after local midnight must never describe the local date as the previous UTC date, and an unusable timezone falls back to the product default, never to UTC.
- *Source:* Live proof 2026-07-29 (12/13 pass): mispaired source labels, and "today, July 28, 2026" answered at 02:05 on 29 July AEST; `packages/shared/src/search/live-web-research.ts`, `packages/shared/src/search/local-date.ts`, `apps/bot/src/router.ts`
- *Added:* 2026-07-29
- *Extends:* R67 (live web research contract)

### R71 — A live-research reply must be post-processable, so self-sending tools are withheld for that turn (extends R70)
`reply_to_user` sends from inside its own handler, so anything it delivers can never be corrected by the router. A turn carrying live-research findings must therefore run with that tool withheld, forcing the answer through the loop's final text where model-written links are stripped and verified title/URL pairs are appended. Withholding is per-turn and non-destructive: it produces a filtered copy sharing tool definitions by reference, and the shared registry — and therefore every ordinary turn — is untouched. The corollary binds too: source rewriting must be strictly gated. `applyVerifiedSources` runs only when a pre-search passed `hasUsableFindings` and produced at least one source, and returns its input untouched otherwise, so ordinary replies — including deliberate answers containing a specific URL — are never stripped or annotated.
- *Source:* Release safety check on 812fb96 (the full registry was passed on every turn; the passing proof avoided `reply_to_user` by model choice, not by guarantee); `packages/shared/src/agent/tools.ts`, `apps/bot/src/router.ts`
- *Added:* 2026-07-29
- *Extends:* R70 (atomic source pairs)

### R72 — Verified sources are turn-scoped state that every delivery path must honour (extends R71)
Whenever a search succeeds in a turn — whether the router pre-searched or the model called `web_research` itself — its atomic title/URL pairs are recorded in per-turn state carried on `AgentDeps`. Never module-level: one collector is created per turn so concurrent turns stay isolated. Pairs keep call order and deduplicate by URL, and the first title recorded for a URL wins so a later, vaguer label cannot displace one already shown. Every path that delivers text to the owner reads that same state and applies the verified-source rewrite before sending — including tools that send from inside their own handler, which must apply it immediately before dispatch and after any language rewrite. The rewrite is strictly gated by emptiness: with no verified sources the text is returned unchanged, so ordinary turns, and turns following failed or empty research, stay byte-identical including any URL the owner deliberately asked for. What is persisted must be what was delivered, but a delivered message body must never be written into the audit trail.
- *Source:* Model-initiated delivery gap after R71 — an implicit follow-up ("Yes please.") reaching `web_research` then replying via `reply_to_user` bypassed router post-processing; `packages/shared/src/search/verified-sources.ts`, `packages/shared/src/features/01-text-command.ts`, `apps/bot/src/router.ts`
- *Added:* 2026-07-29
- *Extends:* R71 (live-research replies must be post-processable)

### R73 — A successful search must not be lost to a local composition timeout (extends R72)
`OLLAMA_TIMEOUT_MS` bounds each `OllamaProvider.chat()` call, not the agent loop — every loop round gets a fresh allowance. When explicit pre-search has already succeeded and local composition then times out, the turn must deliver the answer that already exists rather than a generic backend error. Eligibility is structural, not conditional: the fallback is armed only on the branch reachable after `hasUsableFindings` passed, so absent, empty, or zero-source research keeps the existing failure behaviour. The catch must be typed — `OllamaProviderError` with `code === "timeout"` — never message-string matching, so database, provider, tool, validation, and other local-model error classes rethrow unchanged. The fallback calls no provider again and never retries the local model; it renders through the existing shared source renderer so atomic pairs and local-date context are preserved. It must never follow a reply that was already delivered, which requires counting sends made during the turn rather than assuming. The command job is completed normally with exactly the delivered text, so redelivery cannot re-execute it. Exactly one sanitized audit row is written, carrying only fallback type, source count, answer length, searches used, elapsed time, and the local timeout code.
- *Source:* Live proof failure 2026-07-29 11:38 (`OllamaProviderError: Ollama request timed out.` after a successful pre-search); `apps/bot/src/router.ts`
- *Added:* 2026-07-29
- *Extends:* R72 (turn-scoped verified sources)

### R74 — Every delivered item carries the one source that supports it (extends R70)
Atomic title/URL pairing keeps a title with its own link; it does not say which link supports which item. For an explicit request for N verified items, exactly N items are delivered, each carrying one verified source that directly supports that same item, rendered beside it rather than in a trailing list. Only sources actually cited by a delivered item may appear — an unused search result is never appended. The model cites by exact source title, not by URL; a citation that matches no verified source is dropped together with its item, because delivering an item without a supporting link recreates the defect this rule replaces. Section fronts, homepages and general bulletins are withheld from citation whenever a real article is available for that turn. Model-written URLs remain stripped, atomic pairing remains intact, and the local-date behaviour is unaffected. The same renderer serves local composition and the timeout fallback, so both obey this guarantee. Replies must use WhatsApp formatting: markdown `**` must never reach the owner literally.
- *Source:* Live proof 2026-07-29 at e5528b5 — three headlines delivered with four appended sources, two mapping to no item, plus literal `**` in the WhatsApp body; `packages/shared/src/search/headline-answer.ts`
- *Added:* 2026-07-29
- *Extends:* R70 (atomic source pairs), R72 (turn-scoped verified sources)


### R75 — Support is proven by the provider's own citation, never by model assertion (supersedes the title-citation part of R74)
Anthropic's web search attaches citations to the specific text span they support (`TextBlock.citations`, `web_search_result_location` with `cited_text`, `title`, `url`). That relationship must be preserved end to end and is the only admissible proof that a source supports a claim. Delivered items are built from cited claims alone: a claim ships because the provider cited it, never because a model named a source title, emitted a marker, chose an index, or produced a plausible URL shape. For an explicit request for N items, deliver exactly N cited items when available; when fewer exist, say honestly how many were verified and never pad from model knowledge. Only citations belonging to delivered items may appear. A generic page is admissible exactly when the provider cited it for that claim — URL shape must not decide relevance. If the local model omits markers, cites the wrong source, invents a genuine-looking title, or returns malformed structure, render the native cited result; never fall back to a flat source list for a verified item response. The timeout fallback uses the same native result. Search-result usability (a search succeeded) and item deliverability (the provider cited it) are distinct conditions and must not be conflated.
- *Source:* Live proof 2026-07-29 at e5528b5 and the title-matching gap in 5a9fec1; `packages/shared/src/search/cited-answer.ts`, `packages/shared/src/search/live-web-research.ts`
- *Added:* 2026-07-29
- *Extends:* R74 (item-level source relationships), R70 (atomic pairs)


### R76 — Runtime tool data and persisted audit data are different objects (extends R52)
A tool's return value serves the agent in memory; `audit_log` serves diagnosis and must hold only non-identifying scalars. The two must never be the same object. Tools declare what may be persisted through an explicit audit projection; without one, the loop records an empty input and an empty output rather than an arbitrary payload, and a projection that throws degrades to empty rather than leaking. Handlers keep returning their complete results unchanged — narrowing happens at the persistence boundary, never by weakening what the model or the verified-source collector receives. Persisted audit records must never contain answer text, claim text, cited text, source titles, URLs, tool queries, message bodies, phone numbers, LIDs, request identifiers, encrypted content, or credentials. Purpose-built sanitized events such as `web_presearch` and `web_research_fallback` keep their approved shapes.
- *Source:* Live proof 2026-07-29 at bc7da5b, condition 15 — `audit_log` held answer text, titles and URLs from six different tools since 2026-04-26; `packages/shared/src/agent/loop.ts`, `packages/shared/src/agent/tools.ts`
- *Added:* 2026-07-29
- *Extends:* R52 (public errors are safe, raw errors are logs only), R69 (log diagnostics without content)

---

## Fixes log

| Date | What broke / decision | Rule(s) | Resolution |
|---|---|---|---|
| 2026-04-25 | Project naming collision discovered during research | R1 | Codename retained internally; rename gate added before any public surface |
| 2026-04-25 | Idea bloat risk identified during pre-mortem | R7 | Tier+effort tagging required on every idea, P0 cap of 10 |
| 2026-04-25 | State divergence risk between WhatsApp and Dashboard | R5 | Single Postgres source of truth mandated |
| 2026-04-25 | Renamed project OpenClaw → NitsyClaw | R1 → R13 | R1 superseded by R13 |
| 2026-04-25 | whatsapp-web.js cannot run on Vercel serverless | R14 | Split deploy: dashboard on Vercel, bot on Railway |
| 2026-04-25 | Test depth locked to full pyramid | R15 | Vitest unit+integration, Playwright e2e, coverage gates |
| 2026-04-25 | WhatsApp transport must be swappable A↔B | R16 | `WhatsAppClient` interface; features never import the lib |
| 2026-04-28 | Dashboard `/chat` deflected to WhatsApp ("different versions") | R17 | Single `buildSystemPrompt` source of truth, surface-aware addendum |
| 2026-04-28 | WhatsApp + dashboard had no shared conversation context | R18 | `loadCrossSurfaceHistory` pulls last 20 from both; `surface` column |
| 2026-04-28 | Web search was a stub returning empty results | R19 | Anthropic server-side `web_search_20250305` injected into LLM tools |
| 2026-04-28 | Tool routes timing out at default 10s | R20 | Mandatory `runtime/dynamic/maxDuration` exports |
| 2026-04-28 | PowerShell scripts silently failing on smart chars | R21 | ASCII-only enforced |
| 2026-04-28 | Stuck on `.git/index.lock` after script crashes | R22 | Always pre-clear lock |
| 2026-04-28 | `vercel env pull` wiped local secrets | R23 | Never run pull |
| 2026-04-28 | `DATABASE_URL` env var stored with literal quotes | R24 | Paste WITHOUT quotes in Vercel UI |
| 2026-04-28 | Vercel served stale "ok" deploy while new build failed | R25 | Redeploy without cache to surface real errors |
| 2026-04-28 | Shared dynamic-imports apps/bot, poisoning dashboard build | R26 | Reaffirmed; cleanup agent scheduled 2026-05-12 |
| 2026-04-28 | Whack-a-mole on noUncheckedIndexedAccess (4 deploys) | R27 | Grep full build path before pushing fix |
| 2026-04-28 | Broom flashed console window every 2 min despite -WindowStyle Hidden | R28 | wscript+VBS launcher with WshShell.Run vbHide |
| 2026-04-28 | Doc updates were lagging behind code commits | R29 | Mind.md + Constitution updated in same push as every fix, not batched |
| 2026-04-28 | WhatsApp "hello" never got a reply — bot killed mid-handler | R30 | Surgical watchdog: per-process idempotent launchers; broom only restarts what's dead |
| 2026-04-28 | Broom thrashing trying to keep local dashboard alive | R31 | Removed dashboard check from broom; Vercel handles production |
| 2026-04-28 | Needed one-command pattern for user feature requests | R32 | `*add <description>` trigger codified in NWP-v1.2 + CLAUDE.md |
| 2026-04-28 | Broom committed suicide every 2 min (regex matched its own path) | R33 | Narrowed regex; explicit self-exclusion (broom.ps1, broom-silent.vbs, launch-bot.ps1, silent-launcher.ps1) |
| 2026-04-28 | Bot "alive" but silent — wa-session websocket dropped without event | R34 | Operator restart for now; periodic wa-session probe pending |
| 2026-04-28 | Feature requests scattered across PARKED + chat history + ad-hoc | R35 | `feature_requests` Postgres table; `request_feature` tool on both surfaces |
| 2026-04-28 | No automation: feature requests required manual session to implement | R36 | Daily build agent (CCR routine) processes queue with NWP + safety guardrails |
| 2026-04-28 | Bot replies invisible — WhatsApp self-chat notifications silent / user moved on | R37 | Every outbound also POSTs to ntfy.sh; phone + PC + browser all push-notified |
| 2026-04-29 | `schedule_call` only wrote to Google; Wattage M365 had read but no write path | R38 | `calendar` enum on tool input, persisted to confirmation payload; `resolve_confirmation` routes per provider; dashboard falls back to Google when outlook is unreachable from Vercel |
| 2026-04-29 | `/chat` Send produced user bubble + no reply text on user's two Chrome browsers; server endpoints healthy | R39 | Defensive streaming reader (reverse-search assistant, HTTP-status check, per-event console logs), automatic fallback to non-streaming `/api/chat` when streaming yields nothing |
| 2026-06-23 | Solo takes on material decisions / opinion asks burned trust over multiple sessions | R41 | Council + agents + best skill mandatory on material info and opinion triggers; codified at three layers (memory, R41, global CLAUDE.md) so it cannot drift |
| 2026-05-01 | Public Vercel dashboard exposed private memories, briefs, reminders, conversations, and settings without auth | R41 | Added dashboard middleware with Basic auth, production fail-closed when password env is missing, and static-asset-only bypass |
| 2026-05-01 | WhatsApp bot ready but owner self-chat messages still dropped | R42 | Added shared owner-ID normalization and safe `fromMe=true` self-chat acceptance; added regression tests |
| 2026-05-01 | WhatsApp output awkward on mobile and `Yes` could resolve to `No pending confirmations` without context | R43 | Let orphan yes/no fall through to agent context; banned WhatsApp markdown tables in prompt; cleaned mojibake from morning brief and plate output |
| 2026-05-01 | WhatsApp stopped again with bot process still alive and no fresh bot.log writes | R44 | Broom now restarts only the bot when bot.log is stale for 15 minutes despite a live bot process |
| 2026-05-01 | WhatsApp could become dead inside a live bot process without `disconnected` recovery | R45 | Adapter now probes active WhatsApp health and recreates the client on repeated probe failures, disconnects, auth failures, or send failures |
| 2026-05-04 | Mutating dashboard POST routes could be cross-site submitted by a browser with cached Basic Auth | R46 | Added shared same-origin guard, unit coverage for every mutating route, and Playwright hostile-origin destructive POST regression |
| 2026-05-04 | Basic Auth lockout was process-local and weak under serverless scaling | R47 | Added signed session-cookie middleware and Node/Postgres-backed login-attempt lockout path |
| 2026-05-04 | Session auth was missing logout, explicit migration, security headers, and a clean login shell | R48 | Added logout route, auth-attempt SQL migration, middleware security headers, login-shell split, and regression tests |
| 2026-05-04 | Production runtime files still emitted lint warnings after launch hardening | R49 | Removed production-code warnings; remaining lint warnings are confined to tests |
| 2026-05-04 | Test-only lint warnings hid future real warning regressions | R50 | Test helpers and tests must stay lint-clean too; explicit `any` requires a named local type or narrow cast |
| 2026-05-04 | Owner export could include historical raw audit payloads and some private GET routes lacked no-store | R51 | Export-time redaction now covers audit/connected accounts; private API route inventory enforces no-store |
| 2026-05-05 | Dashboard/bot/OAuth failure paths could expose raw provider or DB details; Vercel deploy context missed Google credentials ignore coverage | R52 | Raw failures now stay in server logs; user responses are generic unless a known config error applies; Vercel/Docker ignore policy has regression coverage |
| 2026-05-05 | New `/command` surface worked but blocked on slow state reads before rendering | R53 | Operator state now has a bounded timeout; the command runner renders even when telemetry degrades |
| 2026-05-05 | Aggressive "go all in" requests could become invisible or duplicate work | R54 | Added top-20 operator missions, `/api/operator/jobs`, stable dedupe keys, and mission counts on `/command` |
| 2026-05-05 | Manual mutating-route test inventory could miss a future POST route | R55 | Added route-discovery red-team test that requires `requireSameOrigin` on every dashboard API POST route |
| 2026-05-05 | Queue had no controlled path from pending item to execution | R56 | Added laptop operator runner with dry-run default, explicit claim/reject modes, verification plan, and unsafe-request rejection |
| 2026-05-05 | Local watchdog could restart the bot without any hosted dashboard evidence | R57 | Added DB-backed `local-watchdog` heartbeat publisher and `/health` watchdog freshness |
| 2026-05-05 | Deploys had no checked command-line undo path | R58 | Added dry-run-first Vercel alias rollback helper, rollback manifest, and regression coverage |
| 2026-05-05 | Dashboard chat could attach provider web search to private cross-surface history | R59 | Removed provider-side web search from dashboard chat routes; future research must use explicit minimal-query tooling |
| 2026-05-05 | Delete-everything controls could partially delete data without backup proof | R60 | Added transaction, audit row, password re-auth, and recent export snapshot guard |
| 2026-05-05 | Export snapshot guard was timestamp-only and audit rows could survive delete-everything | R60 | Added signed session-bound export proof, export truncation detection, and all-audit purge before tombstone |
| 2026-05-05 | Global auth lockout could let anyone lock out the owner | R61 | Correct credentials now bypass/clear the global failure bucket; global lockout only affects bad attempts |
| 2026-07-05 | R41 documented dashboard auth but 14 private-data API routes never called the session verifier — CSRF check only | R62 | `requireDashboardSession` added directly to every affected route; new `require-dashboard-session.ts` lib |
| 2026-07-05 | Outlook calendar write/read paths corrupted event times by the local timezone offset | R63 | `formatZonedNaiveIso` (write) + `parseGraphUtcDateTime` (read) replace unsafe ISO string surgery |
| 2026-07-05 | Dead ntfy/toast/mail notify pipeline could fail silently indefinitely with no counter or alert | R64 | Per-channel result tracking + `notify-channels` heartbeat surfaced in nightly WhatsApp health report |
| 2026-07-28 | Every id-less WhatsApp message replayed one stale clarification receipt, so clear requests were answered as ambiguous | R66 | Dedupe key and `sourceExternalId` written only for real message ids; in-memory non-identifying replay key keeps duplicate protection |
| 2026-07-28 | Explicit ask for today's world news answered with a 2024 training-cutoff disclaimer and "would you like me to search?"; the only search path was a server tool injected into a loop that cannot carry `encrypted_content`, and `stubWebSearch` printed a fake "set SERPER_API_KEY" row as data | R67 | Anthropic `web_search_20250305` moved into its own bounded, query-only request behind `deps.liveResearch`; explicit live-info asks search before the agent loop in the same turn; cutoff/permission prompt language removed; stub search deleted; non-secret web research health added to the nightly report |
| 2026-07-29 | `audit_log` persisted tool answer text, source titles, URLs and queries — from six tools, not just `web_research`, since 2026-04-26 | R76 | Runtime and audit payloads split via `ToolDefinition.auditProjection`; loop defaults to empty input/output; `web_research` declares six approved scalars; 53 pre-existing rows inventoried read-only, none altered |
| 2026-07-29 | Model-asserted source titles could not prove that a page supported a headline, and a missing marker fell back to the old flat list | R75 | Provider `TextBlock` citations preserved as `LiveWebResearchClaim`; items built from cited claims only; honest partial answers; leaf modules `types.ts`/`source-format.ts` remove the import cycle |
| 2026-07-29 | Live proof passed the pipeline but delivered three headlines with four appended sources, two mapping to no item, and literal `**` in the WhatsApp body | R74 | Model cites by exact source title; `parseHeadlineAnswer` binds each item to its own verified pair and renders the source beside it; uncited and index-page sources are never delivered; `toWhatsAppText` fixes bold |
| 2026-07-29 | A successful pre-search was thrown away when local composition hit an Ollama timeout, and the owner got a generic backend error instead of the cited answer that already existed | R73 | Typed `code === "timeout"` fallback delivers the verified pre-search answer through the shared renderer; job completed normally; one sanitized audit row. Also corrected: `OLLAMA_TIMEOUT_MS` is per `chat()` call, not per agent loop |
| 2026-07-29 | A model-initiated research turn (implicit follow-up such as "Yes please.") could call `web_research` then reply via `reply_to_user`, bypassing verified-source rewriting | R72 | Turn-scoped `VerifiedSourceCollector` on `AgentDeps`, written by both producers and read by both delivery paths; rewrite gated by emptiness so ordinary replies stay byte-identical |
| 2026-07-29 | A live-research turn could still reach `reply_to_user`, which sends from inside its own handler and so bypasses verified-source rewriting entirely | R71 | `ToolRegistry.without()` withholds the tool for live-research turns only; source rewriting proven gated to successful pre-search with at least one source |
| 2026-07-29 | Live proof passed 12/13 but displayed source labels bound to other domains, and answered "today, July 28" at 02:05 on 29 July AEST | R70 | One two-line renderer for atomic title/URL pairs; model-written URLs stripped and verified pairs appended; `resolveLocalDateContext` pins today to the configured timezone across search, prompt block, and tool |
| 2026-07-29 | A read-only-transaction failure (25006) broke a live proof and left no diagnosable trace: the SQLSTATE sat in `error.cause` which the log formatter never read, and the SQL text consumed the whole 160-char truncation budget. `getDb(url)` also bypassed its own cache, and no path ever closed a client | R69 | `extractSqlState` walks the cause chain with class validation and prefixes the code ahead of truncation; SQL, params and DSNs stripped before redaction; clients cached by exact URL; idempotent `closeDb()` wired into graceful shutdown |
| 2026-07-28 | Live proof failed: the local Ollama brain answered a "five world news headlines" turn, pre-search was unauditable, the tool's failure reason was not stored, and a redundant second provider request ran | R68 | `requiresLiveWeb` forces cloud (privacy guard still first); `web_presearch` audit event added; sanitized `failureCode` persisted via a whitelist; turn cache serves a repeat need at zero searches; pre-search success now requires at least one source |
| 2026-07-28 | Pre-search and the `web_research` tool each carried their own `max_uses`, so one owner turn could bill 5 searches per provider invocation (worst case 5 + 6 loop rounds x 5 = 35) | R67 | `createTurnScopedResearcher` gives one turn a single shared allowance; each call receives only the remainder, and an exhausted budget is refused locally with `max_uses_exceeded` and no provider request |
| 2026-07-28 | Genuine owner "Message Yourself" messages dropped because WhatsApp represents the recipient as `@lid` with an empty chat id and `chatIsMe=false` | R65 | LID→phone resolution via `getContactLidAndPhone` behind a bounded TTL cache, accept only on exact owner match, fail closed otherwise, plus a `whatsapp-inbound` health signal the nightly report must respect |

---

## Return prompt

> You are working on the **NitsyClaw** project. Before doing any work in this repo, in this exact order:
>
> 1. Read `mind.md` in full.
> 2. Read `NitsyClaw-Constitution-v1.0.md` in full (this file).
> 3. Read `ideas/00-INDEX.md` and `ideas/06-p0-shortlist.md`.
> 4. Acknowledge NWP by emitting "NWP acknowledged" as the first line of your first substantive response.
> 5. Run the 7-step NWP loop. The first or second tool call MUST be a TodoList of the 7 steps.
> 6. Ask the user which feature or module to work on next — do NOT assume.
>
> Do not write code, edit `apps/` or `packages/`, or change architecture without first verifying that the change is consistent with R1–R16 above. If a proposed change conflicts with a rule, surface the conflict and propose either (a) a workaround respecting the rule, or (b) a superseding rule (per R12).
