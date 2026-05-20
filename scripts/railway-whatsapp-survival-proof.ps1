param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [int]$WaitSeconds = 120,
    [switch]$Restart
)

$ErrorActionPreference = "Stop"

if ($WaitSeconds -lt 30) {
    throw "WaitSeconds must be at least 30."
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Script
    )

    Write-Host ""
    Write-Host "== $Name =="
    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

function Invoke-ReadyGate {
    param([Parameter(Mandatory = $true)][string]$Label)

    Invoke-Step $Label {
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-whatsapp-ready.ps1 `
            -ProjectId $ProjectId `
            -Environment $Environment `
            -Service $Service `
            -ExpectedCommit $ExpectedCommit `
            -ReadyTimeoutSeconds 240 `
            -ReadyPollSeconds 10
    }
}

Write-Host "== NitsyClaw WhatsApp survival proof =="
Write-Host "Scope: proves Railway health and WhatsApp ready before and after a wait."
Write-Host "Expected commit: $ExpectedCommit"
Write-Host "Restart requested: $($Restart.IsPresent)"

Invoke-ReadyGate "Initial WhatsApp ready proof"

if ($Restart) {
    Invoke-Step "Railway restart" {
        pnpm dlx @railway/cli restart `
            --project $ProjectId `
            --environment $Environment `
            --service $Service `
            --yes `
            --json
    }
}

Write-Host ""
Write-Host "Waiting ${WaitSeconds}s before survival re-check."
Start-Sleep -Seconds $WaitSeconds

Invoke-ReadyGate "Survival WhatsApp ready proof"

Write-Host ""
Write-Host "WhatsApp survival proof passed."
