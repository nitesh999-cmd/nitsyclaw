# Tomorrow Work - WhatsApp Reliability

Date prepared: 2026-05-13

## Current good state

- Dashboard production deploy is live at `https://nitsyclaw.vercel.app`.
- `/health` shows dashboard runtime, bot runtime, WhatsApp client, send status, loop guard, scheduler, reminders, and memory pruner signals.
- `/whatsapp-recovery` exists as the main recovery page for WhatsApp issues.
- The WhatsApp loop breaker was relaxed so normal voice proof bursts should not pause replies.
- Dashboard now warns if Vercel and the Railway bot are running different commits.
- Live smoke currently checks `/whatsapp-recovery` is protected behind login.

## Main blocker

Railway is not authenticated in this terminal.

Observed blocker:

```text
RAILWAY_TOKEN missing
Unauthorized. Please login with railway login
```

This means Codex cannot restart or verify the Railway WhatsApp worker yet.

## First job tomorrow

Authenticate Railway, then restart or redeploy the WhatsApp bot worker.

Minimum proof after Railway is available:

```powershell
pnpm dlx @railway/cli status
```

Then check `/health` and `/whatsapp-recovery` to confirm the bot runtime commit matches the dashboard commit.

## Phone proof script

Run these from WhatsApp after Railway restart:

1. `hi`
2. `pending items`
3. voice note: `what is the weather tomorrow?`
4. `hear it`
5. risky request: `send a message to someone`

Expected result:

- normal replies work
- voice is transcribed
- weather uses the right location/context
- replay works
- risky action asks for confirmation
- loop guard does not pause normal proof traffic

If the loop guard is already paused, send:

```text
resume whatsapp
```

Expected reply:

```text
WhatsApp replies resumed. Send your request again if I missed it.
```

## If something fails

Use `/whatsapp-recovery` first.

- Version mismatch means Railway has not deployed the latest bot.
- No WhatsApp client heartbeat means the bot is down, disconnected, or stale.
- Send failure means WhatsApp session/client is not ready.
- Loop guard paused means repeated sends or echo behavior triggered protection.
- Voice failure points to transcription/media/API handling.

## Next best build after proof passes

Add an authenticated recovery action log so every WhatsApp incident records:

- what failed
- what was checked
- what recovery action was taken
- whether the phone proof passed afterwards

Do not add more big WhatsApp features until the Railway restart and phone proof are clean.
