# Technical Summary

## Tech stack

- Monorepo: pnpm workspace.
- Language: TypeScript.
- Dashboard: Next.js 16, React 19, Tailwind CSS.
- Bot: Node/tsx worker using `whatsapp-web.js`.
- Shared package: Drizzle ORM, Postgres, tools, features, tenancy, command jobs.
- Database: Postgres/Supabase style connection.
- AI APIs: Anthropic SDK, OpenAI SDK, Whisper transcription model.
- Testing: Vitest, Playwright, ESLint, Semgrep, npm audit, ZAP baseline.
- Deployment: Dashboard on Vercel, bot worker on Railway, DB on Supabase.

## Frameworks and packages

Important packages:

- `next`
- `react`
- `drizzle-orm`
- `postgres`
- `@anthropic-ai/sdk`
- `openai`
- `whatsapp-web.js`
- `googleapis`
- `google-auth-library`
- `imapflow`
- `node-cron`
- `pdf-parse`
- `zod`
- `@playwright/test`
- `vitest`

## APIs and integrations

Implemented or partially implemented:

- WhatsApp Web private-owner bot.
- Dashboard API routes.
- Anthropic/OpenAI model calls.
- Spotify OAuth routes and shared connector scaffolding.
- Gmail/Outlook/Drive/OneDrive readiness and connector scaffolding.
- Provider readiness reporting.

Needs setup or not live:

- Gmail live mailbox actions.
- Outlook live mailbox actions.
- Drive/OneDrive selected-file browsing.
- Google Photos.
- Bank feeds.
- Phone/SMS sending.
- Facebook birthdays.
- Social video analysis.

## Database/storage

Single source of truth:

- `packages/shared/src/db/schema.ts`
- Drizzle migrations under `packages/shared/drizzle`

Major tables:

- `messages`
- `memories`
- `reminders`
- `expenses`
- `briefs`
- `confirmations`
- `audit_log`
- `feature_requests`
- `profile_context`
- `connected_accounts`
- `system_heartbeats`
- `dashboard_auth_attempts`
- `command_jobs`

## Authentication

- Dashboard has password login routes under `apps/dashboard/src/app/api/auth`.
- Auth attempts are persisted in `dashboard_auth_attempts`.
- Dev bypass exists in env example but must not be enabled in production.
- Public sale is blocked because multi-user auth and tenant isolation are incomplete.

## Payments

No payment provider is currently wired in the inspected package files.

## AI APIs

Env example includes:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `OPENAI_API_KEY`
- `TRANSCRIPTION_MODEL`
- Optional `SERPER_API_KEY`

## Deployment setup

- `railway.json` and scripts under `scripts/railway-*` for bot/Railway operations.
- `apps/dashboard/vercel.json` and scripts under `scripts/vercel-build.ps1`.
- GitHub Actions CI exists at `.github/workflows/ci.yml`.

## Environment variables found

Representative required/important env vars:

- `DATABASE_URL`
- `DATABASE_URL_DIRECT`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `TRANSCRIPTION_MODEL`
- `ENCRYPTION_KEY`
- `WHATSAPP_OWNER_NUMBER`
- `WHATSAPP_SESSION_DIR`
- `NITSYCLAW_SECRET_ROOT`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `NITSYCLAW_DASHBOARD_USER`
- `NITSYCLAW_DASHBOARD_PASSWORD`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `TIMEZONE`
- `HOME_CITY`
- `CURRENT_CITY`
- `DAILY_LLM_BUDGET_USD`

## Local run commands

- `pnpm install`
- `pnpm bot`
- `pnpm dashboard`
- `pnpm dev`

## Build commands

- `pnpm build`
- `pnpm -r typecheck`

## Test commands

- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:coverage`
- `pnpm lint`
- `pnpm run whatsapp:release-gate`
- `pnpm run customer:check`
- `pnpm run tenant:check`
- `pnpm run provider:health`
- `pnpm run security:deep`

## Current command evidence

Commands run while preparing this pack:

- `pnpm run customer:check`: passed; personal use yes; public sale no.
- `pnpm run tenant:check`: passed; public sale blocked because customer data tables are not tenant-scoped.
- `pnpm run provider:health`: passed; no providers ready/partial; many need setup; bank feeds blocked.

Recent CI evidence:

- Commit `ad8ea31` passed GitHub CI run `26749858594`.

## Known technical risks

- Tenant isolation incomplete for public sale.
- Some provider code exists but provider accounts/scopes/adapters are not ready.
- WhatsApp Web session reliability remains an operational risk.
- Dashboard has many owner/admin routes that should stay hidden from customer demo.
- Audit logs and stored personal data need strict redaction/export/delete review before customers.

