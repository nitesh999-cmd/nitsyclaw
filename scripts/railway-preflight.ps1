$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Railway preflight =="

if (-not $env:RAILWAY_TOKEN) {
    Write-Host "RAILWAY_TOKEN missing"
    Write-Host "Railway CLI cannot manage the bot worker from this terminal until auth is available."
    Write-Host "Use: railway login"
    exit 1
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Host "pnpm missing"
    exit 1
}

$statusCommand = "pnpm dlx @railway/cli status"
Write-Host $statusCommand
pnpm dlx @railway/cli status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway status check failed"
    exit $LASTEXITCODE
}

Write-Host "Railway status check passed"
