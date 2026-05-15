param(
    [string]$ProjectId = $(if ($env:RAILWAY_PROJECT_ID) { $env:RAILWAY_PROJECT_ID } else { "14a48d9f-310a-446f-9350-77a28ebdc239" }),
    [string]$Environment = $(if ($env:RAILWAY_ENVIRONMENT) { $env:RAILWAY_ENVIRONMENT } else { "production" }),
    [string]$Service = $(if ($env:RAILWAY_SERVICE) { $env:RAILWAY_SERVICE } else { "web" }),
    [string]$BaseUrl = $(if ($env:NITSYCLAW_RAILWAY_PUBLIC_URL) { $env:NITSYCLAW_RAILWAY_PUBLIC_URL } else { "https://web-production-c98e2.up.railway.app" }),
    [string]$ExpectedCommit = $(git rev-parse --short HEAD)
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

Write-Host "== NitsyClaw Railway WhatsApp ready gate =="
Write-Host "Project: $ProjectId"
Write-Host "Environment: $Environment"
Write-Host "Service: $Service"
Write-Host "Expected commit: $ExpectedCommit"

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
$runningInstances = @($deployment.instances | Where-Object { $_.status -eq "RUNNING" })

if ($deploymentStatus -ne "SUCCESS") {
    throw "Latest Railway deployment $deploymentId is '$deploymentStatus', not SUCCESS."
}
if ($runningInstances.Count -lt 1) {
    throw "Latest Railway deployment $deploymentId has no RUNNING instance."
}
if ($ExpectedCommit -and -not $deploymentCommit.StartsWith($ExpectedCommit)) {
    throw "Latest Railway deployment $deploymentId is commit $deploymentCommit, expected $ExpectedCommit."
}

$root = Normalize-BaseUrl -Url $BaseUrl
$health = Invoke-WebRequest -UseBasicParsing "$root/healthz" -TimeoutSec 20
if ([string]$health.Content -ne "ok") {
    throw "$root/healthz returned '$($health.Content)', expected 'ok'."
}

$logs = Invoke-CheckedCommand -Label "Railway deployment logs" -Command @(
    "pnpm", "dlx", "@railway/cli", "logs", $deploymentId,
    "--deployment",
    "--lines", "180",
    "--json",
    "--project", $ProjectId,
    "--environment", $Environment,
    "--service", $Service
)

if ($logs -notmatch "\[boot\] NitsyClaw bot starting.*commit=$([regex]::Escape($ExpectedCommit))") {
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
