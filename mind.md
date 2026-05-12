# mind.md — NitsyClaw

> Living technical reference. Read at the start of every session before doing any work.
> Updated: 2026-05-12 (operator fallback + Next.js security patch)

---

## 1. What this project is

**NitsyClaw** is Nitesh's personal AI assistant.

- **Channels:** WhatsApp self-chat (primary), Vercel dashboard at https://nitsyclaw.vercel.app (browser, anywhere)
- **Brain:** Anthropic Claude Sonnet 4.6 with tool use (10 P0 features + safe queued tools)
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
| Dashboard | Next.js 16.2.6 + Tailwind + shadcn-flavored components |
| Tests | Vitest + Playwright |
| Hosting (dashboard) | **Vercel — `nitsyclaw.vercel.app`** |
| Hosting (bot) | **Local PC (always-on, hidden, auto-restart)** |
| Scheduler | node-cron inside the bot |
| Email/calendar (Google) | googleapis (multi-account labeled tokens) |
| Email/calendar (Microsoft) | Microsoft Graph (device-code OAuth) |

Cloud bot via Railway/whatsapp-web.js was attempted and **abandoned** (see §10).
