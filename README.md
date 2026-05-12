# NitsyClaw

A personal AI assistant. WhatsApp is the front door. The Dashboard is the control plane.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # fill in keys
pnpm db:migrate                     # set up Supabase schema
pnpm dev                            # bot + dashboard in parallel
```

## Read these in order

1. `mind.md` — living technical reference
2. `NitsyClaw-Constitution-v1.0.md` — immutable rules (R1–R16)
3. `ideas/06-p0-shortlist.md` — the 10 features built first

## Launch and operations docs

- `docs/architecture.md` — app map, data flow, and highest-risk areas
- `docs/env-guide.md` — required local, bot, dashboard, and production env
- `docs/testing.md` — local, e2e, security, and release verification commands
- `docs/manual-qa-checklist.md` — human smoke checks before go-live
- `docs/pa-v1-launch-checklist.md` — personal-use launch gate
- `docs/release-safety.md` — rollback, secret, and deployment safety rules

## Run

```bash
pnpm bot                # WhatsApp worker (scan QR on first run)
pnpm dashboard          # http://localhost:3000
pnpm test               # unit + integration
pnpm test:e2e           # Playwright e2e
pnpm test:coverage      # coverage report (gate: 70% / 65%)
pnpm run release:preflight
pnpm run operator:next  # dry-run queued work; falls back to offline plan without DATABASE_URL
```

## Deploy

- Dashboard → Vercel
- Bot worker → Railway
- DB → Supabase

See `docs/deploy.md`.

## License

TBD.
