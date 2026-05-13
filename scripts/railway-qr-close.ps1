param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" })
)

$ErrorActionPreference = "Stop"

Write-Host "Closing WhatsApp QR recovery window."

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
    pnpm dlx @railway/cli variable delete $key --project $ProjectId --environment $Environment --service $Service --json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove Railway variable $key." }
}

$afterDeleteVariables = Get-RailwayVariablesJson
if ($LASTEXITCODE -ne 0) { throw "Failed to verify Railway variables after close." }
foreach ($key in $keys) {
    if (Test-VariablePresent -RawJson $afterDeleteVariables -Name $key) {
        throw "Railway variable still present after close: $key"
    }
}

pnpm dlx @railway/cli service restart --project $ProjectId --environment $Environment --service $Service --yes --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to restart Railway service." }

Write-Host "QR recovery variables removed and Railway service restarted."
