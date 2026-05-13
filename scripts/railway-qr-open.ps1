param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$PublicBaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [int]$Minutes = 20
)

$ErrorActionPreference = "Stop"

if ($Minutes -lt 1 -or $Minutes -gt 120) {
    throw "Minutes must be between 1 and 120."
}

$tokenBytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($tokenBytes)
}
finally {
    $rng.Dispose()
}
$token = [Convert]::ToBase64String($tokenBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$until = (Get-Date).ToUniversalTime().AddMinutes($Minutes).ToString("o")

Write-Host "Opening a short WhatsApp QR recovery window for $Minutes minute(s)."
Write-Host "No QR payload will be written to Railway logs."

function Get-RailwayVariablesJson {
    $raw = pnpm dlx @railway/cli variable list --project $ProjectId --environment $Environment --service $Service --json 2>&1
    return ($raw -join "`n")
}

function Test-VariablePresent {
    param(
        [Parameter(Mandatory = $true)][string]$RawJson,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $RawJson -match ('"' + [regex]::Escape($Name) + '"')
}

function Remove-RailwayVariableIfPresent {
    param([Parameter(Mandatory = $true)][string]$Name)
    $variables = Get-RailwayVariablesJson
    if ($LASTEXITCODE -ne 0) { throw "Failed to list Railway variables before removing $Name." }
    if (-not (Test-VariablePresent -RawJson $variables -Name $Name)) { return }
    pnpm dlx @railway/cli variable delete $Name --project $ProjectId --environment $Environment --service $Service --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove Railway variable $Name." }
}

Remove-RailwayVariableIfPresent -Name "NITSYCLAW_PRINT_QR_TO_LOGS"

pnpm dlx @railway/cli variable set "NITSYCLAW_QR_RECOVERY_TOKEN=$token" --project $ProjectId --environment $Environment --service $Service --skip-deploys --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set NITSYCLAW_QR_RECOVERY_TOKEN." }

pnpm dlx @railway/cli variable set "NITSYCLAW_QR_RECOVERY_UNTIL=$until" --project $ProjectId --environment $Environment --service $Service --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set NITSYCLAW_QR_RECOVERY_UNTIL." }

$afterSetVariables = Get-RailwayVariablesJson
if ($LASTEXITCODE -ne 0) { throw "Failed to verify Railway variables." }
if (Test-VariablePresent -RawJson $afterSetVariables -Name "NITSYCLAW_PRINT_QR_TO_LOGS") {
    throw "Unsafe legacy variable is still present: NITSYCLAW_PRINT_QR_TO_LOGS."
}

$base = $PublicBaseUrl.TrimEnd("/")
$url = "$base/recovery/whatsapp-qr"
Write-Host ""
Write-Host "Railway deployment was triggered so the running app receives the new token."
Write-Host "Wait until Railway is healthy before loading the QR."
Write-Host ""
Write-Host "Open this URL on your PC:"
Write-Host $url
Write-Host ""
Write-Host "Paste this recovery token into the page. It is not part of the URL:"
Write-Host $token
Write-Host ""
Write-Host "Then scan it from WhatsApp > Linked devices."
Write-Host ""
Write-Host "After scan, run: pnpm run railway:qr-close"
