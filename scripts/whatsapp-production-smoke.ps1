param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [switch]$SkipRailwayReady
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "== $Name =="
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Write-Host "== NitsyClaw WhatsApp production smoke =="
Write-Host "Scope: deployed Railway health plus safe router prompt coverage."
Write-Host "No live WhatsApp sends. No provider OAuth actions. No production data mutation."

if (-not $SkipRailwayReady) {
    Invoke-Step "Railway WhatsApp ready gate" {
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-whatsapp-ready.ps1 `
            -ProjectId $ProjectId `
            -Environment $Environment `
            -Service $Service `
            -BaseUrl $BaseUrl `
            -ExpectedCommit $ExpectedCommit
    }
}

Invoke-Step "Safe WhatsApp prompt coverage" {
    pnpm exec vitest run `
        apps/bot/test/router.integration.test.ts `
        --testNamePattern "text message .* agent loop|what can you do|WhatsApp self-test|WhatsApp incident summary|sets clear WhatsApp reminders|logs plain text expenses|answers exact pending items"
}

Invoke-Step "Reply shape gate" {
    pnpm run whatsapp:reply-shape
}

Write-Host ""
Write-Host "WhatsApp production smoke passed."
