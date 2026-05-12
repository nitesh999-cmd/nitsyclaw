# NitsyClaw architecture

NitsyClaw is a personal PA made of three main parts:

1. Dashboard
   - Next.js 16 app in `apps/dashboard`.
   - Runs on Vercel.
   - Main surfaces: Today, Ask, Command, Queue, Confirmations, Settings, Health.
   - API routes live under `apps/dashboard/src/app/api`.

2. WhatsApp bot
   - Worker app in `apps/bot`.
   - Intended to run as an always-on worker, currently Railway/local capable.
   - Receives owner WhatsApp messages, stores inbound messages, routes shortcuts, runs the shared agent loop, and sends replies.

3. Shared brain and data layer
   - Shared package in `packages/shared`.
   - Owns database schema, feature tools, agent loop, prompt, encryption helpers, command jobs, and integrations.
   - Drizzle migrations live in `packages/shared/drizzle`.

## Core data flow

1. User sends a dashboard or WhatsApp command.
2. The command is stored before work starts.
3. A `command_jobs` row records status, source, risk level, receipt, result, retries, and errors.
4. Safe commands can enter the agent/tool loop.
5. Unclear commands ask for clarification.
6. Risky external actions require approval before action.
7. User-visible history is stored encrypted for cross-surface recall.

## Highest-risk areas

- WhatsApp duplicate/retry events.
- Risky actions hidden inside casual language.
- Tool inputs/outputs leaking private data.
- Missing database migrations before deploy.
- Dashboard auth and rate limiting.
- WhatsApp worker uptime and session health.
- Claims about integrations that are not live yet.

## Current launch blockers

- Local queue mutation needs `DATABASE_URL` in `.env.local` or `apps/dashboard/.env.local`.
- Public multi-user launch still needs account separation, onboarding, billing, support, and legal/privacy controls.
