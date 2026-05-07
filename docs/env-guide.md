# Environment guide

Copy `.env.local.example` to `.env.local` for local work. Do not commit `.env.local`.

## Required for local dashboard and bot

- `DATABASE_URL`
  - Supabase pooled Postgres URL.
  - Needed by app runtime.
- `DATABASE_URL_DIRECT`
  - Supabase direct Postgres URL.
  - Needed for `pnpm db:migrate`.
- `ENCRYPTION_KEY`
  - 32 random bytes encoded as base64.
  - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `WHATSAPP_OWNER_NUMBER`
  - Owner phone number only.
  - Used to reject non-owner WhatsApp messages.
- `NITSYCLAW_SECRET_ROOT`
  - Optional external folder for local bot secrets and WhatsApp session files.
  - Default: `C:\Users\Nitesh\.nitsyclaw\secrets` on this machine.
- `WHATSAPP_SESSION_DIR`
  - Defaults to `.wa-session`, which the bot resolves under `NITSYCLAW_SECRET_ROOT`.
  - Use an absolute path only when production has persistent storage mounted there.
- `NITSYCLAW_DASHBOARD_PASSWORD`
  - Required outside local dev bypass.
- `ANTHROPIC_API_KEY`
  - Required for dashboard and bot AI replies.

## Optional but useful

- `OPENAI_API_KEY`
  - Embeddings and transcription paths.
- `SERPER_API_KEY`
  - Web search.
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`
  - Spotify connection.
- `CURRENT_CITY`, `CURRENT_REGION`, `CURRENT_COUNTRY`
  - Temporary/current weather location.

## Production safety

- Do not set `NITSYCLAW_DEV_AUTH_BYPASS` on Vercel.
- Rotate secrets if old Docker/Railway/Vercel images were built before `.dockerignore` and `.vercelignore` were hardened.
- Do not deploy code that depends on new tables before `pnpm db:migrate` passes.
- Use separate production secrets from local secrets.

## Current migration gate

Before next deploy:

```powershell
pnpm db:migrate
pnpm run release:preflight
```

If `pnpm db:migrate` says `DATABASE_URL_DIRECT (or DATABASE_URL) not found`, env is not ready.
