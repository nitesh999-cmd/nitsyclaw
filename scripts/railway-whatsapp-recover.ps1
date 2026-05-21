param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [int]$QrMinutes = 60,
    [int]$QrTimeoutSeconds = 1200,
    [int]$ReadyTimeoutSeconds = 600,
    [int]$ReadyPollSeconds = 10,
    [int]$SurvivalWaitSeconds = 120,
    [switch]$SkipSurvival
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    $trimmed = $Url.Trim().TrimEnd("/")
    if ($trimmed -notmatch '^https://[a-z0-9.-]+$') {
        throw "BaseUrl must be a concrete https:// hostname."
    }
    return $trimmed
}

function Get-WhatsAppHealth {
    param([Parameter(Mandatory = $true)][string]$Root)

    try {
        $response = Invoke-WebRequest -UseBasicParsing "$Root/health" -TimeoutSec 20
        return ([string]$response.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Get-HealthCommitShort {
    param($Health)
    if ($Health -and $Health.runtime -and $Health.runtime.commitShort) {
        return [string]$Health.runtime.commitShort
    }
    return ""
}

function Test-WhatsAppReady {
    param($Health)
    return ($Health -and $Health.whatsapp -and $Health.whatsapp.ready -eq $true)
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

function Wait-ForWhatsAppReady {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][int]$PollSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $health = Get-WhatsAppHealth -Root $Root
        $commit = Get-HealthCommitShort -Health $health
        if (Test-WhatsAppReady -Health $health) {
            Write-Host "WhatsApp health is ready on commit $commit."
            return $health
        }

        $remaining = [Math]::Ceiling((New-TimeSpan -Start (Get-Date) -End $deadline).TotalSeconds)
        if ($remaining -gt 0) {
            Write-Host "Waiting for phone scan / WhatsApp ready (${remaining}s left)."
            Start-Sleep -Seconds ([Math]::Min($PollSeconds, $remaining))
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for WhatsApp to become ready."
}

$root = Normalize-BaseUrl -Url $BaseUrl

Write-Host "== NitsyClaw WhatsApp recovery automation =="
Write-Host "Scope: QR recovery only when needed, then ready proof and survival proof."
Write-Host "Project: $ProjectId"
Write-Host "Environment: $Environment"
Write-Host "Service: $Service"
Write-Host "Base URL: $root"

$initialHealth = Get-WhatsAppHealth -Root $root
if (Test-WhatsAppReady -Health $initialHealth) {
    $commit = Get-HealthCommitShort -Health $initialHealth
    Write-Host "WhatsApp is already ready on commit $commit. Skipping QR recovery."
} else {
    Write-Host "WhatsApp is not ready. Opening a verified QR recovery window."
    Invoke-Step "Open QR recovery" {
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-qr-open.ps1 `
            -ProjectId $ProjectId `
            -Environment $Environment `
            -Service $Service `
            -PublicBaseUrl $root `
            -Minutes $QrMinutes `
            -TimeoutSeconds $QrTimeoutSeconds `
            -PollSeconds $ReadyPollSeconds
    }

    Write-Host ""
    Write-Host "Scan the printed QR now. This command will wait for WhatsApp to become ready."
    $initialHealth = Wait-ForWhatsAppReady -Root $root -TimeoutSeconds $ReadyTimeoutSeconds -PollSeconds $ReadyPollSeconds
    $commit = Get-HealthCommitShort -Health $initialHealth
}

if (-not $commit) {
    throw "Could not determine deployed commit from /health."
}

Invoke-Step "Railway WhatsApp ready proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-whatsapp-ready.ps1 `
        -ProjectId $ProjectId `
        -Environment $Environment `
        -Service $Service `
        -BaseUrl $root `
        -ExpectedCommit $commit `
        -ReadyTimeoutSeconds $ReadyTimeoutSeconds `
        -ReadyPollSeconds $ReadyPollSeconds
}

if (-not $SkipSurvival) {
    Invoke-Step "WhatsApp survival proof" {
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts/railway-whatsapp-survival-proof.ps1 `
            -ProjectId $ProjectId `
            -Environment $Environment `
            -Service $Service `
            -ExpectedCommit $commit `
            -WaitSeconds $SurvivalWaitSeconds
    }
}

Write-Host ""
Write-Host "WhatsApp recovery automation passed."
Write-Host "Deployed commit: $commit"
Write-Host "Phone proof still recommended: send 'proof test' in WhatsApp."
