# WhatsApp Recovery Runbook

Use this when Railway is alive but WhatsApp is not replying, QR recovery is needed, or Railway has sent deploy-crash/health noise.

## Goal

Recover the Railway WhatsApp bot without guessing, stale QR scans, or unnecessary deploys.

Success means:

- Railway deployment is `SUCCESS`.
- `/healthz` returns `ok`.
- `/health` reports `whatsapp.ready:true`.
- Logs show the WhatsApp ready sequence.
- A phone message such as `proof test` or `hi` replies in WhatsApp.

## Fast Diagnosis

From the repo root:

```powershell
cd C:\Users\Nitesh\projects\NitsyClaw
pnpm dlx @railway/cli whoami --json
curl.exe -sS https://web-production-c98e2.up.railway.app/health
pnpm run railway:whatsapp-ready -- -ExpectedCommit <deployed-commit>
```

Interpretation:

- `whatsapp.ready:true` means do not open QR recovery. Run proof instead.
- `whatsapp.ready:false` plus repeated QR logs means the phone is not linked.
- `Unauthorized` means refresh Railway auth with `pnpm run railway:login`.
- `QR recovery is not enabled` means the recovery window is missing, expired, or not loaded in the running deployment.

## Open A Fresh QR Window

Only do this if `/health` says WhatsApp is not ready.

Preferred guided command:

```powershell
pnpm run railway:whatsapp-recover
```

This checks current health, opens QR recovery only if needed, waits for the phone scan, runs ready proof, then runs survival proof.

Manual command:

```powershell
pnpm run railway:qr-open -- -Minutes 60 -TimeoutSeconds 1200 -PollSeconds 20
```

Only scan after the helper prints both:

- `Railway health verified`
- `QR endpoint verified`

Then:

1. Open the printed recovery URL on the PC.
2. Paste the printed token into the page.
3. Click `Load QR`.
4. On the phone: WhatsApp -> Settings -> Linked devices -> Link a device.
5. Scan the QR.
6. Wait until the phone confirms the linked device.

Do not scan an old QR. Do not scan after the printed expiry time.

## Proof After Scan

After scanning, run:

```powershell
pnpm run railway:whatsapp-ready -- -ExpectedCommit <deployed-commit>
```

Then check the live health body:

```powershell
curl.exe -sS https://web-production-c98e2.up.railway.app/health
```

Expected:

- `status:"ok"`
- `whatsapp.ready:true`
- `loopBreaker.paused:false`
- `runtime.commitShort` matches the deployed commit

Then run the survival proof:

```powershell
pnpm run railway:whatsapp-survival -- -ExpectedCommit <deployed-commit> -WaitSeconds 120
```

## Close QR Recovery

Do not close recovery immediately after scanning. Closing variables can trigger a Railway deployment.

Close only after WhatsApp ready proof passes:

```powershell
pnpm run railway:qr-close
```

If you intentionally need to close recovery while WhatsApp is not ready:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-qr-close.ps1 -Force
```

Use `-Force` only when you accept that recovery may remain broken until another QR window is opened.

## Deploy Safety

Before pushing WhatsApp-impacting changes:

```powershell
pnpm run ci:powershell
pnpm run whatsapp:release-gate
```

After push and Railway deploy:

```powershell
pnpm run railway:whatsapp-ready -- -ExpectedCommit <new-commit>
pnpm run railway:whatsapp-survival -- -ExpectedCommit <new-commit> -WaitSeconds 120
```

Then send `proof test` or `hi` from the phone.

## What Not To Do

- Do not trust `/healthz` alone. It only proves the HTTP server is alive.
- Do not tell the user to scan until the QR SVG endpoint has been verified.
- Do not run `qr-close` before WhatsApp ready proof.
- Do not stack multiple Railway deploys while one is still `QUEUED`, `BUILDING`, `INITIALIZING`, or `DEPLOYING`.
- Do not claim WhatsApp is fixed until both Railway proof and phone proof pass.

## Known Failure Patterns

| Symptom | Meaning | Action |
|---|---|---|
| `QR recovery is not enabled` | Window expired or env not loaded in running deployment | Refresh Railway auth, reopen QR, wait for verified SVG |
| Repeated `QR code received` logs | Phone is not linked | Open fresh verified QR and scan |
| `/healthz` is `ok`, `/health` says `ready:false` | HTTP alive, WhatsApp not linked | QR recovery needed |
| Railway CLI `Unauthorized` | Local Railway auth expired | Run `pnpm run railway:login` |
| Deploy stuck in queued/building | Railway is still processing | Wait or inspect logs; do not stack deploys |
