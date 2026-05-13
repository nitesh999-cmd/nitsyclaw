$ErrorActionPreference = "Stop"

Write-Host "== NitsyClaw Railway crash diagnose =="
Write-Host "Read-only: recent logs only. No service mutation."

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Host "pnpm missing"
    exit 1
}

Write-Host "pnpm dlx @railway/cli whoami --json"
pnpm dlx @railway/cli whoami --json
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway CLI is not authenticated for this terminal."
    Write-Host "Use: pnpm run railway:login"
    exit $LASTEXITCODE
}

$projectId = if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }
$environment = if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }
$service = if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path "logs" "railway-diagnose"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Project: $projectId"
Write-Host "Environment: $environment"
Write-Host "Service: $service"

function Invoke-RailwayCapture {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Args
    )

    $outFile = Join-Path $outDir "$stamp-$Name.jsonl"
    Write-Host ""
    Write-Host "== $Name =="
    Write-Host ("pnpm dlx @railway/cli " + ($Args -join " "))
    & pnpm dlx @railway/cli @Args 2>&1 | Tee-Object -FilePath $outFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$Name failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Invoke-RailwayCapture "latest-deployment" @(
    "logs",
    "--project", $projectId,
    "--environment", $environment,
    "--service", $service,
    "--latest",
    "--deployment",
    "--lines", "220",
    "--json"
)

Invoke-RailwayCapture "runtime-latest" @(
    "logs",
    "--project", $projectId,
    "--environment", $environment,
    "--service", $service,
    "--latest",
    "--lines", "220",
    "--json"
)

Write-Host ""
Write-Host "Saved under $outDir. Look first for: [boot] fatal, Invalid env, relation does not exist, Chromium, WhatsApp, or exit code."
