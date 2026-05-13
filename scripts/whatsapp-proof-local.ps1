$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw local WhatsApp proof =="
Write-Host "Scope: web smoke + WhatsApp/recovery automated tests. Railway worker control is intentionally excluded."

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

Invoke-Step "Live smoke" {
    pnpm run release:live-smoke
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
Write-Host "Railway is parked. Use the Railway preflight separately when credentials are available."
