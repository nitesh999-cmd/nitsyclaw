param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDeploymentUrl,

    [string[]]$Aliases = @(
        "nitsyclaw.vercel.app",
        "nitsyclaw-dashboard.vercel.app"
    ),

    [string]$ProjectRoot = "",

    [string]$ExpectedCommit = "",

    [string]$ExpectedProject = "nitsyclaw",

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
$targetJson = & npx vercel inspect $TargetDeploymentUrl --json --wait --cwd $ProjectRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "Rollback target inspection failed. Alias was not changed."
    exit $LASTEXITCODE
}
$target = $targetJson | ConvertFrom-Json
$targetText = $target | ConvertTo-Json -Depth 50

if ($target.name -ne $ExpectedProject) {
    Write-Error "Rollback target project mismatch. Expected $ExpectedProject, got $($target.name)."
    exit 1
}
if ($target.target -ne "production") {
    Write-Error "Rollback target is not a production deployment. Target was $($target.target)."
    exit 1
}
if ($target.readyState -ne "READY") {
    Write-Error "Rollback target is not READY. State was $($target.readyState)."
    exit 1
}
$targetUrl = "https://$($target.url)"
if ($targetUrl.TrimEnd("/") -ne $TargetDeploymentUrl.TrimEnd("/")) {
    Write-Error "Rollback target URL mismatch after inspect. Expected $TargetDeploymentUrl, got $targetUrl."
    exit 1
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedCommit)) {
    if ($targetText -notmatch [regex]::Escape($ExpectedCommit)) {
        Write-Error "Rollback target did not expose expected commit $ExpectedCommit in Vercel inspect metadata."
        exit 1
    }
}

$healthPath = "/api/healthz"
$healthStatusPattern = "HTTP/.* 200"
if ($targetText -notmatch '"path"\s*:\s*"api/healthz"') {
    $healthPath = "/login"
    $healthStatusPattern = "HTTP/.* (200|307)"
}

$currentAliasTargets = @{}
foreach ($Alias in $Aliases) {
    $aliasJson = & npx vercel inspect "https://$Alias" --json --wait --cwd $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Current production alias inspection failed for $Alias. Alias was not changed."
        exit $LASTEXITCODE
    }
    $aliasTarget = $aliasJson | ConvertFrom-Json
    $currentAliasTargets[$Alias] = "https://$($aliasTarget.url)"
}

$primaryAlias = $Aliases[0]
$currentUrl = $currentAliasTargets[$primaryAlias]
if ($currentUrl.TrimEnd("/") -eq $TargetDeploymentUrl.TrimEnd("/")) {
    Write-Error "Rollback target is already the current production alias target."
    exit 1
}

function Restore-Aliases {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$ChangedAliases,

        [Parameter(Mandatory = $true)]
        [hashtable]$PreviousTargets,

        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    foreach ($ChangedAlias in $ChangedAliases) {
        $PreviousTarget = $PreviousTargets[$ChangedAlias]
        if ([string]::IsNullOrWhiteSpace($PreviousTarget)) {
            Write-Error "No previous target recorded for $ChangedAlias; manual alias inspection required."
            continue
        }
        Write-Host "Restoring $ChangedAlias to $PreviousTarget"
        & npx vercel alias set $PreviousTarget $ChangedAlias --cwd $Root
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to restore $ChangedAlias to $PreviousTarget; manual rollback repair required."
        }
    }
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Current $primaryAlias target: $currentUrl"
    Write-Host "Verified rollback target: $TargetDeploymentUrl"
    Write-Host "Rollback health probe after apply: https://$primaryAlias$healthPath"
    Write-Host "Dry run only. To apply rollback, run:"
    Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/vercel-rollback.ps1 -TargetDeploymentUrl `"$TargetDeploymentUrl`" -DryRun:`$false"
    Write-Host ""
    Write-Host "Underlying commands:"
    foreach ($Alias in $Aliases) {
        Write-Host "npx vercel alias set $TargetDeploymentUrl $Alias --cwd `"$ProjectRoot`""
    }
    exit 0
}

$changedAliases = @()

Write-Host "Applying primary rollback alias: $primaryAlias -> $TargetDeploymentUrl"
& npx vercel alias set $TargetDeploymentUrl $primaryAlias --cwd $ProjectRoot
if ($LASTEXITCODE -ne 0) {
    Write-Error "Rollback alias update failed for $primaryAlias."
    exit $LASTEXITCODE
}
$changedAliases += $primaryAlias

$health = & curl.exe -sS -I "https://$primaryAlias$healthPath"
if ($LASTEXITCODE -ne 0 -or ($health -notmatch $healthStatusPattern) -or ($health -notmatch "Cache-Control: no-store")) {
    Write-Error "Primary alias health check failed. Restoring $primaryAlias to $currentUrl."
    Restore-Aliases -ChangedAliases $changedAliases -PreviousTargets $currentAliasTargets -Root $ProjectRoot
    exit 1
}

for ($i = 1; $i -lt $Aliases.Count; $i++) {
    $Alias = $Aliases[$i]
    Write-Host "Applying rollback alias: $Alias -> $TargetDeploymentUrl"
    & npx vercel alias set $TargetDeploymentUrl $Alias --cwd $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Rollback alias update failed for $Alias. Restoring changed aliases."
        Restore-Aliases -ChangedAliases $changedAliases -PreviousTargets $currentAliasTargets -Root $ProjectRoot
        exit $LASTEXITCODE
    }
    $changedAliases += $Alias
}

Write-Host "Rollback complete: aliases now point to $TargetDeploymentUrl"
