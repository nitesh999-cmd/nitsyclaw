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
