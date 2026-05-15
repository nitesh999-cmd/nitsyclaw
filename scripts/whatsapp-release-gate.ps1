$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw WhatsApp release gate =="
Write-Host "Scope: deterministic WhatsApp command routing, receipt wording, loop breaker, and local bot tests."
Write-Host "No Railway mutation. No WhatsApp sends. No provider OAuth actions."

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

Invoke-Step "Receipt wording guard" {
    pnpm run whatsapp:receipt-guard
}

Invoke-Step "WhatsApp smoke tests" {
    pnpm run whatsapp:smoke
}

Invoke-Step "Capability registry tests" {
    pnpm exec vitest run `
        apps/bot/src/whatsapp-capability-registry.test.ts `
        apps/bot/src/personal-command-shortcuts.test.ts `
        apps/bot/test/router.integration.test.ts
}

Write-Host ""
Write-Host "WhatsApp release gate passed."
