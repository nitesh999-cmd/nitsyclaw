# NitsyClaw V1 daily-use PA launch checklist

This is the practical go-live gate for the personal PA version. It is not the public-sale checklist.

## V1 daily-use PA scope

- Dashboard chat and WhatsApp share memory/history.
- Every normal command is saved to `command_jobs` before work starts.
- The user gets an immediate receipt: saved, working, needs clarification, or needs approval.
- Messy or emotional requests clarify before action.
- Safe requests can proceed through the agent/tool loop.
- Risky requests stop before action.
- Voice input is browser-based and supports English (Australia), English (US), and Hindi / Hinglish.

## Must pass before deploy

- `DATABASE_URL_DIRECT` or `DATABASE_URL` is available for migration.
- `pnpm db:migrate` applies the `command_jobs` table.
- `pnpm run release:preflight` passes.
- Login, `/chat`, `/api/healthz`, and `/command` load after deploy.
- One safe command creates a done job.
- One unclear command creates a clarification job.
- One risky command asks for approval.

## Safety rules

- No real outbound send/call/book/pay action without approval.
- No public multi-user launch until tenant isolation exists.
- No broad private account scanning without explicit connector setup and consent.
- No deployment unless rollback is known.
- No claims that phone calls, bank feeds, or app control are live unless tested live.

## Current known blockers

- Local DB migration needs `DATABASE_URL_DIRECT` or `DATABASE_URL`.
- Browser speech recognition is useful for personal testing, not enough for commercial-grade voice.
- Public sale still needs account separation, billing, onboarding, support, and privacy/legal review.

## Morning review

Check:

1. What changed since the last commit?
2. What tests passed?
3. What failed?
4. Is production database migrated?
5. Is rollback available?
6. What is still manual?
7. What is unsafe to automate?
