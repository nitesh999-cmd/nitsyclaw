$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Railway preflight =="

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Host "pnpm missing"
    exit 1
}

$whoamiCommand = "pnpm dlx @railway/cli whoami --json"
Write-Host $whoamiCommand
pnpm dlx @railway/cli whoami --json
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway CLI is not authenticated for this terminal."
    Write-Host "Use: pnpm run railway:login"
    exit $LASTEXITCODE
}

$projectId = if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }
$environment = if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }
$service = if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }

$statusCommand = "pnpm dlx @railway/cli service list --project $projectId --environment $environment --json"
Write-Host $statusCommand
pnpm dlx @railway/cli service list --project $projectId --environment $environment --json
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway status check failed"
    exit $LASTEXITCODE
}

$serviceStatusCommand = "pnpm dlx @railway/cli service status --project $projectId --environment $environment --service $service --json"
Write-Host $serviceStatusCommand
pnpm dlx @railway/cli service status --project $projectId --environment $environment --service $service --json
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway service status check failed"
    exit $LASTEXITCODE
}

$variableCommand = "pnpm dlx @railway/cli variable list --project $projectId --environment $environment --service $service --json"
Write-Host $variableCommand
$variableJsonRaw = pnpm dlx @railway/cli variable list --project $projectId --environment $environment --service $service --json 2>&1
$variableJson = $variableJsonRaw -join "`n"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway variable check failed"
    exit $LASTEXITCODE
}

function Test-RailwayVariablePresent {
    param(
        [Parameter(Mandatory = $true)][string]$RawJson,
        [Parameter(Mandatory = $true)][string]$Name
    )
    return $RawJson -match ('"' + [regex]::Escape($Name) + '"')
}

$requiredVars = @(
    "NITSYCLAW_SECRET_ROOT",
    "WHATSAPP_SESSION_DIR",
    "PUPPETEER_EXECUTABLE_PATH"
)

$missingVars = @()
foreach ($name in $requiredVars) {
    if (-not (Test-RailwayVariablePresent -RawJson $variableJson -Name $name)) {
        $missingVars += $name
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host ("Railway missing required persistence/runtime variable(s): " + ($missingVars -join ", "))
    Write-Host "NITSYCLAW_SECRET_ROOT must point at the mounted Railway volume so WhatsApp auth survives deploys."
    exit 1
}

if (Test-RailwayVariablePresent -RawJson $variableJson -Name "NITSYCLAW_PRINT_QR_TO_LOGS") {
    Write-Host "Unsafe legacy QR log variable is still present: NITSYCLAW_PRINT_QR_TO_LOGS"
    Write-Host "Unset it. Use NITSYCLAW_QR_RECOVERY_TOKEN + NITSYCLAW_QR_RECOVERY_UNTIL instead."
    exit 1
}

Write-Host "Railway status check passed"
