# Deploy — NitsyClaw

Two surfaces, one DB. Constitution R14 forbids running the bot on Vercel.

## 1. Database — Supabase

1. Create a new project at supabase.com.
2. Enable extension: `create extension if not exists vector;` (Settings → Database → Extensions).
3. Copy both URIs:
   - **Pooled** (used by Vercel/Next.js): Settings → Database → Connection pooling.
   - **Direct** (used by bot worker + migrations): Settings → Database → Connection string.
4. Put both into `.env.local` as `DATABASE_URL` and `DATABASE_URL_DIRECT`.
5. Run migrations: `pnpm db:generate && pnpm db:migrate`.

## 2. Dashboard — Vercel

1. `cd apps/dashboard && vercel link`
2. Set env vars in Vercel dashboard:
   - `DATABASE_URL` (pooled)
   - `ANTHROPIC_API_KEY`
   - `NITSYCLAW_DASHBOARD_USER`
   - `NITSYCLAW_DASHBOARD_PASSWORD`
   - `WHATSAPP_OWNER_NUMBER`
   - `ENCRYPTION_KEY` (required; no implicit plaintext storage)
   - `QUIET_HOURS_*`, `GOOGLE_*`
3. `vercel --prod`
4. Production URL goes into `NEXTAUTH_URL`.

## 3. Bot worker — Railway

1. New project → "Deploy from repo" → choose this monorepo.
2. Service settings:
   - Root: `/`
   - Build: `pnpm install && pnpm --filter @nitsyclaw/shared build`
   - Start: `pnpm --filter @nitsyclaw/bot start`
3. Add a **persistent volume** mounted at `/app/.wa-session`. Without this, every redeploy forces a QR rescan.
4. Set env vars (mirror the dashboard plus):
   - `DATABASE_URL_DIRECT` — direct, not pooled
   - `WHATSAPP_OWNER_NUMBER`
   - `OPENAI_API_KEY`
   - `ENCRYPTION_KEY` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
5. First boot: open Railway logs, scan the QR with WhatsApp on your phone (Settings → Linked Devices → Link a Device).
6. Logs should show `[boot] WhatsApp ready` — you're live.

### Puppeteer args on Railway

Already wired in `apps/bot/src/wwebjs-client.ts`:
```
--no-sandbox --disable-setuid-sandbox --single-process --no-zygote --disable-dev-shm-usage
```
These are required because Railway runs containers as non-root.

## 4. Verifying

| Check | Command |
|---|---|
| Bot reachable | Send "what's on my plate today" from your phone |
| Dashboard reachable | Open the Vercel URL |
| DB write path | Send any message → check Conversations page |
| Cron firing | Wait until 7am local — check Today page for the brief |

## 5. Rollback

- Dashboard: Vercel → Deployments → previous → "Promote to production".
- Bot worker: Railway → Deployments → previous → redeploy.
- DB schema: rollback by re-running an earlier `drizzle-kit migrate` snapshot.

## 6. Cost ballpark (monthly)

| Service | v1 personal use | Notes |
|---|---|---|
| Vercel Hobby | $0 | Sufficient for 1 user |
| Railway | $5 starter | Always-on |
| Supabase Free | $0 | 500MB DB, plenty for v1 |
| Anthropic | $5–$20 | Sonnet 4.6, 1–2 messages/min average |
| OpenAI Whisper | $1–$3 | $0.006/min |
| **Total** | **~$11–$28** | |
