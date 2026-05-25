param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [string]$ExpectedCommit = $(git rev-parse --short HEAD),
    [int]$ReadyTimeoutSeconds = $(if ($env:NITSYCLAW_RAILWAY_READY_TIMEOUT_SECONDS) { [int]$env:NITSYCLAW_RAILWAY_READY_TIMEOUT_SECONDS } else { 180 }),
    [int]$ReadyPollSeconds = $(if ($env:NITSYCLAW_RAILWAY_READY_POLL_SECONDS) { [int]$env:NITSYCLAW_RAILWAY_READY_POLL_SECONDS } else { 10 })
)

$ErrorActionPreference = "Stop"

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
    return $text
}

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Url)
    $trimmed = $Url.Trim().TrimEnd("/")
    if ($trimmed -notmatch '^https://[a-z0-9.-]+$') {
        throw "BaseUrl must be a concrete https:// hostname."
    }
    return $trimmed
}

function Get-DeploymentLogs {
    param([Parameter(Mandatory = $true)][string]$DeploymentId)

    $logs = Invoke-CheckedCommand -Label "Railway deployment logs" -Command @(
        "pnpm", "dlx", "@railway/cli", "logs", $DeploymentId,
        "--deployment",
        "--lines", "500",
        "--project", $ProjectId,
        "--environment", $Environment,
        "--service", $Service
    )

    if ($logs -notmatch "\[boot\] NitsyClaw bot starting" -or $logs -notmatch "\[wwebjs\] client ready") {
        $logsJson = Invoke-CheckedCommand -Label "Railway deployment JSON logs" -Command @(
            "pnpm", "dlx", "@railway/cli", "logs", $DeploymentId,
            "--deployment",
            "--lines", "500",
            "--json",
            "--project", $ProjectId,
            "--environment", $Environment,
            "--service", $Service
        )
        $logs = "$logs`n$logsJson"
    }

    return $logs
}

function Test-ReadyLogs {
    param(
        [Parameter(Mandatory = $true)][string]$Logs,
        [Parameter(Mandatory = $true)][string]$Commit,
        [bool]$AllowUnknownCommit = $false
    )

    $bootCommitMatches = $Logs -match "\[boot\] NitsyClaw bot starting.*commit=$([regex]::Escape($Commit))"
    if (-not $bootCommitMatches -and $AllowUnknownCommit) {
        $bootCommitMatches = $Logs -match "\[boot\] NitsyClaw bot starting.*commit=unknown"
    }

    return (
        $bootCommitMatches -and
        $Logs -match "\[wwebjs\] client ready" -and
        $Logs -match "\[boot\] WhatsApp ready"
    )
}

Write-Host "== NitsyClaw Railway WhatsApp ready gate =="
Write-Host "Project: $ProjectId"
Write-Host "Environment: $Environment"
Write-Host "Service: $Service"
Write-Host "Expected commit: $ExpectedCommit"
Write-Host "Ready timeout: ${ReadyTimeoutSeconds}s"

$statusJson = Invoke-CheckedCommand -Label "Railway status" -Command @(
    "pnpm", "dlx", "@railway/cli", "status", "--json"
)
$status = $statusJson | ConvertFrom-Json

$serviceNode = $status.environments.edges.node.serviceInstances.edges.node |
    Where-Object { $_.serviceName -eq $Service } |
    Select-Object -First 1
if (-not $serviceNode) {
    throw "Railway service '$Service' was not found in status output."
}

$deployment = $serviceNode.latestDeployment
if (-not $deployment) {
    throw "Railway service '$Service' has no latest deployment."
}

$deploymentId = [string]$deployment.id
$deploymentStatus = [string]$deployment.status
$deploymentCommit = [string]$deployment.meta.commitHash
$deploymentMessage = [string]$deployment.meta.cliMessage
$metadataCommitMatches = $ExpectedCommit -and $deploymentCommit.StartsWith($ExpectedCommit)
$cliMessageCommitMatches = $ExpectedCommit -and [string]::IsNullOrWhiteSpace($deploymentCommit) -and $deploymentMessage -match [regex]::Escape($ExpectedCommit)
$runningInstances = @($deployment.instances | Where-Object { $_.status -eq "RUNNING" })

if ($deploymentStatus -ne "SUCCESS") {
    throw "Latest Railway deployment $deploymentId is '$deploymentStatus', not SUCCESS."
}
if ($runningInstances.Count -lt 1) {
    throw "Latest Railway deployment $deploymentId has no RUNNING instance."
}
if ($ExpectedCommit -and -not $metadataCommitMatches -and -not $cliMessageCommitMatches) {
    throw "Latest Railway deployment $deploymentId is commit $deploymentCommit, expected $ExpectedCommit."
}
if ($cliMessageCommitMatches) {
    Write-Host "Railway deployment commit metadata is empty; accepted CLI deploy message containing expected commit $ExpectedCommit."
}

$root = Normalize-BaseUrl -Url $BaseUrl
$health = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
if ([string]$health.Content -ne "ok") {
    throw "$root/healthz returned '$($health.Content)', expected 'ok'."
}

$deadline = (Get-Date).AddSeconds([Math]::Max(15, $ReadyTimeoutSeconds))
$logs = ""
do {
    $logs = Get-DeploymentLogs -DeploymentId $deploymentId
    if (Test-ReadyLogs -Logs $logs -Commit $ExpectedCommit -AllowUnknownCommit $cliMessageCommitMatches) {
        break
    }

    $remaining = [Math]::Ceiling((New-TimeSpan -Start (Get-Date) -End $deadline).TotalSeconds)
    if ($remaining -gt 0) {
        Write-Host "WhatsApp ready logs not complete yet; retrying in ${ReadyPollSeconds}s (${remaining}s left)."
        Start-Sleep -Seconds ([Math]::Min($ReadyPollSeconds, $remaining))
    }
} while ((Get-Date) -lt $deadline)

if (-not (Test-ReadyLogs -Logs $logs -Commit $ExpectedCommit -AllowUnknownCommit $cliMessageCommitMatches)) {
    Write-Host "Last checked logs did not contain the complete ready sequence before timeout."
}

if ($logs -notmatch "\[boot\] NitsyClaw bot starting.*commit=$([regex]::Escape($ExpectedCommit))" -and -not ($cliMessageCommitMatches -and $logs -match "\[boot\] NitsyClaw bot starting.*commit=unknown")) {
    throw "Railway logs for $deploymentId do not show the expected boot commit $ExpectedCommit."
}
if ($logs -notmatch "\[wwebjs\] client ready") {
    throw "Railway logs for $deploymentId do not show '[wwebjs] client ready'."
}
if ($logs -notmatch "\[boot\] WhatsApp ready") {
    throw "Railway logs for $deploymentId do not show '[boot] WhatsApp ready'."
}

Write-Host "Railway WhatsApp ready gate passed."
Write-Host "Deployment: $deploymentId"
Write-Host "Health: $root/healthz ok"
