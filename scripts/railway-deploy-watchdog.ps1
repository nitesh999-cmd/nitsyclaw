param(
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [int]$MaxBuildingAgeSeconds = $(if ($env:NITSYCLAW_RAILWAY_MAX_BUILDING_AGE_SECONDS) { [int]$env:NITSYCLAW_RAILWAY_MAX_BUILDING_AGE_SECONDS } else { 600 })
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

if ($MaxBuildingAgeSeconds -lt 60) {
    throw "MaxBuildingAgeSeconds must be at least 60."
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$Command
    )

    Write-Host ($Command -join " ")
    $exe = $Command[0]
    $args = @()
    if ($Command.Count -gt 1) {
        $args = $Command[1..($Command.Count - 1)]
    }
    $output = & $exe @args 2>&1
    $text = $output -join "`n"
    if ($LASTEXITCODE -ne 0) {
        Write-Host $text
        throw "$Label failed with exit code $LASTEXITCODE"
    }
    return ,$text
}

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    $trimmed = $Url.Trim().TrimEnd("/")
    if ($trimmed -notmatch '^https://[a-z0-9.-]+$') {
        throw "BaseUrl must be a concrete https:// hostname."
    }
    return $trimmed
}

function Get-DeploymentLabel {
    param([Parameter(Mandatory = $true)]$Deployment)
    $id = [string]$Deployment.id
    $status = [string]$Deployment.status
    $commit = [string]$Deployment.meta.commitHash
    $message = [string]$Deployment.meta.cliMessage
    if ([string]::IsNullOrWhiteSpace($message)) {
        $message = [string]$Deployment.meta.commitMessage
    }
    if ($commit.Length -gt 7) {
        $commit = $commit.Substring(0, 7)
    }
    return "$status $id commit=$commit message=$message"
}

function Get-DeploymentCreatedAtUtc {
    param([Parameter(Mandatory = $true)]$Deployment)
    $createdAt = $Deployment.createdAt.PSObject.BaseObject
    if ($createdAt -is [DateTime]) {
        return ([DateTime]::SpecifyKind(([DateTime]$createdAt), [DateTimeKind]::Utc))
    }
    $raw = [string]$createdAt
    $parsedOffset = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($raw, [ref]$parsedOffset)) {
        return $parsedOffset.UtcDateTime
    }
    return ([DateTime]::Parse($raw)).ToUniversalTime()
}

Write-Host "== Railway deploy watchdog =="
Write-Host "Service: $Service"
Write-Host "Environment: $Environment"
Write-Host "Max building age: ${MaxBuildingAgeSeconds}s"

Write-Host "pnpm --silent dlx @railway/cli deployment list --service $Service --environment $Environment --limit 10 --json"
$rawDeploymentList = & pnpm --silent dlx @railway/cli deployment list --service $Service --environment $Environment --limit 10 --json 2>&1
$deploymentListText = [string]::Join("`n", @($rawDeploymentList))
if ($LASTEXITCODE -ne 0) {
    Write-Host $deploymentListText
    throw "Railway deployment list failed with exit code $LASTEXITCODE"
}

$parsedDeploymentList = $deploymentListText | ConvertFrom-Json
$deployments = if ($parsedDeploymentList -is [System.Array]) { $parsedDeploymentList } else { @($parsedDeploymentList) }
if ($deployments.Count -lt 1) {
    throw "Railway returned no deployments for service '$Service'."
}

$latest = $deployments[0]
$latestStatus = [string]$latest.status
$latestId = [string]$latest.id

Write-Host "Latest: $(Get-DeploymentLabel -Deployment $latest)"

if ($latestStatus -eq "SUCCESS") {
    $root = Normalize-BaseUrl -Url $BaseUrl
    $health = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
    if ([string]$health.Content -ne "ok") {
        throw "$root/healthz returned '$($health.Content)', expected 'ok'."
    }
    Write-Host "railway_deploy_watchdog=ok"
    Write-Host "serving_deployment=$latestId"
    Write-Host "health=$root/healthz ok"
    exit 0
}

if ($latestStatus -eq "SKIPPED") {
    $priorSuccess = $deployments | Where-Object { [string]$_.status -eq "SUCCESS" } | Select-Object -First 1
    if (-not $priorSuccess) {
        throw "Latest Railway deployment $latestId was SKIPPED and no prior SUCCESS deployment was found."
    }

    $root = Normalize-BaseUrl -Url $BaseUrl
    $health = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
    $priorId = [string]$priorSuccess.id
    if ([string]$health.Content -ne "ok") {
        throw "Latest Railway deployment $latestId was SKIPPED, but public health is '$($health.Content)'. Check Railway logs before restart."
    }
    Write-Host "railway_deploy_watchdog=ok"
    Write-Host "latest_deployment=$latestId skipped"
    Write-Host "serving_deployment=$priorId"
    Write-Host "health=$root/healthz ok"
    exit 0
}

$latestCreatedAt = Get-DeploymentCreatedAtUtc -Deployment $latest
$ageSeconds = [Math]::Floor(((Get-Date).ToUniversalTime() - $latestCreatedAt).TotalSeconds)
Write-Host "Latest age: ${ageSeconds}s"

if ($latestStatus -in @("BUILDING", "DEPLOYING")) {
    $priorSuccess = $deployments | Where-Object { [string]$_.status -eq "SUCCESS" } | Select-Object -First 1
    if ($ageSeconds -lt $MaxBuildingAgeSeconds) {
        Write-Host "railway_deploy_watchdog=waiting"
        Write-Host "latest_deployment=$latestId"
        Write-Host "reason=$latestStatus age ${ageSeconds}s is below threshold ${MaxBuildingAgeSeconds}s"
        exit 0
    }

    if ($priorSuccess) {
        $root = Normalize-BaseUrl -Url $BaseUrl
        $health = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
        $priorId = [string]$priorSuccess.id
        if ([string]$health.Content -eq "ok") {
            throw "Railway deployment $latestId is stuck in $latestStatus for ${ageSeconds}s. Previous successful deployment $priorId is still serving $root/healthz ok. Use a manual Railway upload deploy or investigate Railway build queue before more feature work."
        }
        throw "Railway deployment $latestId is stuck in $latestStatus for ${ageSeconds}s and public health is '$($health.Content)'. Check Railway logs before restart."
    }

    throw "Railway deployment $latestId is stuck in $latestStatus for ${ageSeconds}s and no prior SUCCESS deployment was found."
}

if ($latestStatus -in @("CRASHED", "FAILED", "REMOVED")) {
    throw "Latest Railway deployment $latestId ended as $latestStatus. Check bounded logs before restart."
}

throw "Latest Railway deployment $latestId is in unexpected status '$latestStatus'."
