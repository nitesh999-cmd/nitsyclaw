# Post-deploy proof

Use this after pushing to `main` and waiting for Railway/Vercel to finish deploying.

For WhatsApp QR recovery, stale QR, or Railway bot relink issues, use `docs/whatsapp-recovery-runbook.md`.

## Command

```powershell
pnpm run release:post-deploy-proof
```

## What it proves

- Railway bot worker is on the expected commit.
- Railway `/healthz` returns `ok`.
- Railway logs show WhatsApp client ready.
- Public dashboard smoke checks pass.
- The operator gets exact phone prompts for WhatsApp proof.

## Phone proof

Send these in WhatsApp self-chat:

1. `proof test`
   - Expected: `WhatsApp proof`
   - Expected: current commit
   - Expected: `Database marker: passed`
   - Expected: `Loop guard: ok`

2. `I spent $6.50 at Chemist Warehouse for medicine`
   - Expected: expense logged in `AUD`

3. `what can you do`
   - Expected: compact `NitsyClaw menu`
   - Expected sections: `Try`, `Works now`, `Needs setup`, `Safety`, `More`

If any phone proof fails, capture the exact WhatsApp message, screenshot, and time, then run:

```powershell
pnpm run railway:diagnose
```
