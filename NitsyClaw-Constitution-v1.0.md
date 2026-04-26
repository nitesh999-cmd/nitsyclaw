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
