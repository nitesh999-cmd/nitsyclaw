param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDeploymentUrl,

    [string[]]$Aliases = @(
        "nitsyclaw.vercel.app",
        "nitsyclaw-dashboard.vercel.app"
    ),

    [string]$ProjectRoot = "",

    [bool]$DryRun = $true
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptDir = Split-Path -Parent $PSCommandPath
    $ProjectRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$vercelProjectFile = Join-Path $ProjectRoot ".vercel\project.json"
if (-not (Test-Path -LiteralPath $vercelProjectFile)) {
    Write-Error "ProjectRoot must point at the linked NitsyClaw repo. Missing $vercelProjectFile"
    exit 1
}

if ($TargetDeploymentUrl -notmatch '^https://[a-z0-9-]+\.vercel\.app/?$') {
    Write-Error "TargetDeploymentUrl must be a concrete https://*.vercel.app deployment URL."
    exit 1
}

foreach ($Alias in $Aliases) {
    if ($Alias -notmatch '^[a-z0-9.-]+$') {
        Write-Error "Alias must be a hostname only, for example nitsyclaw.vercel.app."
        exit 1
    }
}

Write-Host "Inspecting rollback target: $TargetDeploymentUrl"
& npx vercel inspect $TargetDeploymentUrl --wait --cwd $ProjectRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "Rollback target inspection failed. Alias was not changed."
    exit $LASTEXITCODE
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only. To apply rollback, run:"
    Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl `"$TargetDeploymentUrl`" -DryRun:`$false"
    Write-Host ""
    Write-Host "Underlying commands:"
    foreach ($Alias in $Aliases) {
        Write-Host "npx vercel alias set $TargetDeploymentUrl $Alias --cwd `"$ProjectRoot`""
    }
    exit 0
}

foreach ($Alias in $Aliases) {
    Write-Host "Applying rollback alias: $Alias -> $TargetDeploymentUrl"
    & npx vercel alias set $TargetDeploymentUrl $Alias --cwd $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Rollback alias update failed for $Alias."
        exit $LASTEXITCODE
    }
}

Write-Host "Rollback complete: aliases now point to $TargetDeploymentUrl"
