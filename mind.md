# mind.md — NitsyClaw

> Living technical reference. Read at the start of every session before doing any work.
> Updated: 2026-04-26 (session 1 — rename + scaffold + 10 P0 features + tests)

---

## 1. What this project is

**NitsyClaw** is Nitesh's personal AI assistant.
- **Front door:** WhatsApp via `whatsapp-web.js` (Path B).
- **Control plane:** Web dashboard at `apps/dashboard/`.
- **Brain:** Anthropic Claude Sonnet 4.6 with tool use.

## 2. Stack (LOCKED — Constitution R13/R14)

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+) |
| Monorepo | pnpm workspaces |
| WhatsApp | whatsapp-web.js + LocalAuth |
| LLM | Anthropic Claude Sonnet 4.6 |
| Voice | OpenAI Whisper API |
| DB | Supabase Postgres + pgvector |
| ORM | Drizzle |
| Dashboard | Next.js 15 + Tailwind + shadcn/ui |
| Tests | Vitest + Playwright |
| Hosting | Vercel (dashboard) + Railway (bot) |
| Scheduler | node-cron |

## 3. Folder layout

```
NitsyClaw/
├── apps/
│   ├── bot/             ← whatsapp-web.js worker (Railway)
│   └── dashboard/       ← Next.js (Vercel)
├── packages/shared/
│   ├── src/db/          ← Drizzle schema + client
│   ├── src/whatsapp/    ← WhatsAppClient interface (R16) + Mock
│   ├── src/agent/       ← Claude tool-use loop, tools, memory
│   ├── src/features/    ← 10 P0 features (one file each)
│   ├── src/utils/       ← time, parse, crypto
│   └── test/            ← unit tests
├── docs/
├── ideas/
└── …
```

## 4. The 10 P0 features

| # | Feature | File |
|---|---|---|
| 1 | Text command (NLU dispatch) | `01-text-command.ts` |
| 2 | Voice capture → transcribe → file | `02-voice-capture.ts` |
| 3 | Reminders (one-shot + recurring) | `03-reminders.ts` |
| 4 | Morning brief (7am cron) | `04-morning-brief.ts` |
| 5 | "What's on my plate today?" | `05-whats-on-my-plate.ts` |
| 6 | Memory recall | `06-memory-recall.ts` |
| 7 | Schedule call (calendar write) | `07-schedule-call.ts` |
| 8 | Web research | `08-web-research.ts` |
| 9 | Confirmation rail | `09-confirmation-rail.ts` |
| 10 | Receipt → expense logged | `10-receipt-expense.ts` |

Every feature is a pure function. The agent loop dispatches based on intent. Each has unit + integration tests.

## 5. Run commands

```bash
pnpm install
pnpm dev                  # bot + dashboard parallel
pnpm bot                  # WhatsApp worker only
pnpm dashboard            # http://localhost:3000
pnpm test                 # unit + integration (Vitest)
pnpm test:coverage        # coverage gate 70/65
pnpm test:e2e             # Playwright
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## 6. Deploy (R14 — split)

- Dashboard → Vercel
- Bot worker → Railway (volume mount on `.wa-session/`)
- DB → Supabase (pgvector enabled)

Puppeteer args on Railway: `--no-sandbox --disable-setuid-sandbox --single-process --no-zygote`.

Full instructions: `docs/deploy.md`.

## 7. Test pyramid (R15)

- **Unit:** every feature, util, agent module — 50+ tests, ≥80% per feature
- **Integration:** every feature flow with `MockWhatsAppClient` + in-memory DB — 20+ tests
- **E2E:** Playwright against dashboard — 7 specs
- **CI gate:** 70% lines, 65% branches; live tests `@live` skipped in CI

## 8. Known issues

- Real Claude API key needed for live agent-loop integration tests; mocked in CI
- Voice transcription costs (~$0.006/min); cost meter logs every call
- Railway free tier 500hr/mo — plenty for personal use
- WhatsApp Web QR rescan on session corruption; alert via email

## 9. Session log

| Date | Session | Summary |
|---|---|---|
| 2026-04-25 | 0 | Scaffold (as OpenClaw). 120 ideas, Constitution v1.0, no code. |
| 2026-04-26 | 1 | Renamed to **NitsyClaw**. Locked stack. Built monorepo. Implemented 10 P0 features. Wrote unit + integration + e2e tests. Constitution updated R13–R16. |

## 10. Return prompt

> Read `mind.md` and `NitsyClaw-Constitution-v1.0.md` in full. Then `ideas/06-p0-shortlist.md`. Confirm "NWP acknowledged". Run 7-step loop. Ask which feature to extend or P1 to promote — do not assume.
