$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw local WhatsApp proof =="
Write-Host "Scope: deterministic local WhatsApp/recovery tests only."
Write-Host "No Vercel smoke. No Railway control. No live WhatsApp session. No live WhatsApp sends."

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "== $Name =="
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Invoke-Step "WhatsApp recovery tests" {
    pnpm exec vitest run `
        apps/bot/src/whatsapp-loop-breaker.test.ts `
        apps/bot/test/router.integration.test.ts `
        apps/bot/test/whatsapp-health.test.ts `
        wwebjs-client-regression.test.ts `
        router-send-failure.test.ts `
        whatsapp-recovery-page.test.ts `
        whatsapp-recovery-action-route.test.ts `
        package-scripts.test.ts
}

Write-Host ""
Write-Host "Local WhatsApp proof passed."
Write-Host "For deployed dashboard smoke, use the explicit live proof script."
Write-Host "For Railway WhatsApp readiness, run: pnpm run railway:whatsapp-ready"
