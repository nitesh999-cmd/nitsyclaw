$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw live WhatsApp proof bundle =="
Write-Host "Scope: deployed Vercel smoke plus deterministic local WhatsApp/recovery tests."
Write-Host "No live WhatsApp sends. No Railway worker control."

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

Invoke-Step "Local WhatsApp proof" {
    pnpm run whatsapp:proof-local
}

Write-Host ""
Write-Host "Live WhatsApp proof bundle passed."
