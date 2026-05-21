param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$PublicBaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:CI = "1"
$env:PNPM_CONFIG_LOGLEVEL = "error"
$pnpmExe = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$pnpmCommand = if ($pnpmExe) { $pnpmExe.Source } else { "pnpm" }

function Invoke-RailwayCli {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $pnpmCommand dlx @railway/cli @CliArgs 2>&1
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

Write-Host "Closing WhatsApp QR recovery window."
Write-Host "This removes Railway variables and can trigger a deployment."

function Get-WhatsAppHealth {
    param([Parameter(Mandatory = $true)][string]$BaseUrl)

    try {
        $response = Invoke-WebRequest -UseBasicParsing "$BaseUrl/health" -TimeoutSec 20
        return ([string]$response.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

$base = $PublicBaseUrl.TrimEnd("/")
$health = Get-WhatsAppHealth -BaseUrl $base
if (-not $Force) {
    if (-not $health -or -not $health.whatsapp -or $health.whatsapp.ready -ne $true) {
        throw "Refusing to close QR recovery because WhatsApp is not proven ready. Run railway:whatsapp-ready first, or rerun with -Force if you intentionally want to close it."
    }
    Write-Host "WhatsApp health verified ready before closing recovery."
}

function Get-RailwayVariablesJson {
    $raw = Invoke-RailwayCli variable list --project $ProjectId --environment $Environment --service $Service --json
    return ($raw -join "`n")
}

function Test-VariablePresent {
    param(
        [Parameter(Mandatory = $true)][string]$RawJson,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $RawJson -match ('"' + [regex]::Escape($Name) + '"')
}

$keys = @(
    "NITSYCLAW_QR_RECOVERY_TOKEN",
    "NITSYCLAW_QR_RECOVERY_UNTIL",
    "NITSYCLAW_PRINT_QR_TO_LOGS"
)

foreach ($key in $keys) {
    $variables = Get-RailwayVariablesJson
    if ($LASTEXITCODE -ne 0) { throw "Failed to list Railway variables before removing $key." }
    if (-not (Test-VariablePresent -RawJson $variables -Name $key)) {
        Write-Host "$key already absent."
        continue
    }
    Invoke-RailwayCli variable delete $key --project $ProjectId --environment $Environment --service $Service --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove Railway variable $key." }
}

$afterDeleteVariables = Get-RailwayVariablesJson
if ($LASTEXITCODE -ne 0) { throw "Failed to verify Railway variables after close." }
foreach ($key in $keys) {
    if (Test-VariablePresent -RawJson $afterDeleteVariables -Name $key) {
        throw "Railway variable still present after close: $key"
    }
}

Write-Host "QR recovery variables removed. Railway deployment was triggered if any variable changed."
