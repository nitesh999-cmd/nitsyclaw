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

$statusCommand = "pnpm dlx @railway/cli status"
Write-Host $statusCommand
pnpm dlx @railway/cli status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway status check failed"
    exit $LASTEXITCODE
}

Write-Host "Railway status check passed"
