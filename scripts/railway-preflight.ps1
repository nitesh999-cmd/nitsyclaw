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

Write-Host "Railway status check passed"
